var express = require("express");
var cors = require("cors");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var axios = require("axios");
const tf = require("@tensorflow/tfjs");
const cocoSsd = require("@tensorflow-models/coco-ssd");
const jpeg = require("jpeg-js");
const redis = require("redis");
const AWS = require("aws-sdk");
var app = express();
const port = "8002";
const bucketName = "n10840044-traffic-aid"
const key_QLDtrafficAPI = "QLDtrafficAPI"
const key_TopTen = "TopTen"
// S3 setup - IAM role 
const s3Client = new AWS.S3({ apiVersion: "2006-03-01" });

// ./redis-cli -h n10840044.km2jzi.ng.0001.apse2.cache.amazonaws.com -p 6379
// ./redis-cli -h master.traffic-aid.km2jzi.apse2.cache.amazonaws.com --tls -a 0bc4041c48a71d35b9389055
// Redis setup
const url = `rediss://master.traffic-aid.km2jzi.apse2.cache.amazonaws.com:6379`;
const redisClient = redis.createClient({
    url,
    password: '0bc4041c48a71d35b9389055'
});

// wait for Redis connection
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.log(err);
  }
})();

// Print redis errors to the console
redisClient.on("error", (err) => {
  console.log("Error " + err);
});

// when redis is connected
redisClient.on("connect", () => {
  console.log("Redis connected");
});

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());

async function getS3Object(bucketName,keyName){
  try{
    const params = { Bucket: bucketName, Key: keyName };
    const s3Result = await s3Client.getObject(params).promise();
    const s3JSON = JSON.parse(s3Result.Body);
    console.log(`Get ${keyName} successfully from S3 ${keyName}`)
    return s3JSON
  }
  catch(err){
    console.log(`Failed to get ${keyName}, error status code is ${err.statusCode}`)
    return false
  }
}

async function putS3Object(bucketName,keyName,date){
  try{
    const body = JSON.stringify(date)
    const objectParams = { Bucket: bucketName, Key: keyName, Body: body };
    await s3Client.putObject(objectParams).promise();
    console.log(`Save ${keyName} successfully to S3 ${keyName}`)
  }
  catch(err){
    console.log(`Failed to get ${keyName} from S3, error status code is ${err.statusCode}`)
    throw err
  }
}

async function fetchQLDTraffic(){
  const config = {
    method: "get",
    url: "https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=3e83add325cbb69ac4d8e5bf433d770b",
  };
  const response = await axios(config)
  return response
}

function getDate(){
  const date = new Date(new Date().toUTCString())
  const day = JSON.stringify(date).slice(1,11)
  return day
}

function checkTimeStamp(apiInfo){
  const day = getDate()
  if(day != apiInfo.validity){return false}
  else{return true}
}

async function getRedisKey(keyName){
  try{
    const result = await redisClient.get(keyName);
    return result
  }
  catch(err){
    throw err
  }
}

async function setRedisKey(keyName,content,ttl){
  try{
    const value = JSON.stringify({
      source: "RedisCache",
      id:content.id,
      count:content.count.length,
      countInfo:content.count
        })
  await redisClient.setEx(
      keyName,
      ttl, // ttl is 60 seconds
      value)
  return value
  }
  catch(err){
    throw err
  }
}

async function getPrediction(url){
    const buf = await axios.get(
      url, {responseType: 'arraybuffer',})
    const model = await cocoSsd.load()
    const NUMBER_OF_CHANNELS = 3
    const pixels = jpeg.decode(buf.data, true)
    const imageByteArray = (image, numChannels) => {
    const pixels = image.data
    const numPixels = image.width * image.height
    const values = new Int32Array(numPixels * numChannels)
      for (let i = 0; i < numPixels; i++) {
        for (let channel = 0; channel < numChannels; ++channel) {
          values[i * numChannels + channel] = pixels[i * 4 + channel]
        }
      }
      return values
    }
    const imageToInput = (image, numChannels) => {
      const values = imageByteArray(image, numChannels)
      const outShape = [image.height, image.width, numChannels]
      const input = tf.tensor3d(values, outShape, "int32")
      return input
    }
    const input = imageToInput(pixels, NUMBER_OF_CHANNELS)
    const predictions = await model.detect(input)
    const precise = predictions.filter((predict)=>{
        return predict.class == "car" || predict.class == "truck"
    })
    return precise
  }

async function fetchQLDTrafficAPI(){
  // find the key - QLDtrafficAPI, if yes, fetch, check the validity
    var trafficInfo = await getS3Object(bucketName,key_QLDtrafficAPI)
    const validity = checkTimeStamp(trafficInfo)
    // no or invalid, fetch api, then add the timestamp
    if(!trafficInfo || !validity){
      console.log("Fetch QLDtraffic API due to no info or invalid")
      const response = await fetchQLDTraffic()
      trafficInfo = response.data.features.map((feature)=>{
      return {
        id:feature.properties.id,
        description:feature.properties.description,
        url:feature.properties.image_url,
        coordinates:feature.geometry.coordinates,
        }
      })
      trafficInfo = {source:"QLDTraffic API",validity:getDate(),info:trafficInfo}
    // save to s3
      data = {...trafficInfo}
      data.source = "S3"
      await putS3Object(bucketName,key_QLDtrafficAPI,data)
    }
    return trafficInfo
}

function addCount(locations,toptenInfo){
  locations.map((locationID)=>{
    toptenInfo = toptenInfo.map((location)=>{
      if(location.id == locationID){
        location.count = location.count + 1
        return location
      }
      else{
        return location
      }
    })
  })
  toptenInfo.sort(
    (l1, l2) => 
    (l1.count < l2.count) ? 1 : (l1.count > l2.count) ? -1 : 0);
  return toptenInfo
  }
function includesNullValue(arr){
  const check = arr.filter((ele)=>{if(ele.count==null){ return 1}})
  if(check == null){return false}
  else{return true}
}

app.post("/traffic", async (req, res) => {
  try{
    const locations = req.body
    // get top ten from S3
    var toptenInfo = await getS3Object(bucketName,key_TopTen)
    // add top ten by the locations
    const data = addCount(locations,toptenInfo)
    // save top ten to S3
    await putS3Object(bucketName,key_TopTen,data)
    const topTen = {source:"Processed",data:data.slice(0,10)}
    // check in redis
    var countInfo = await Promise.all(locations.map(async (ID)=> {
      const count = await getRedisKey(ID.toString())
      if(count == null){
        return {id:ID,count:count}
      }
      else{
        return JSON.parse(count)
      }
    }))
    if(includesNullValue(countInfo)){
      const trafficInfo = await fetchQLDTrafficAPI()
      countInfo = await Promise.all(countInfo.map(async (location)=>{
      if(location.count == null){
          const info = trafficInfo.info.filter((cam)=>{
            if(cam.id == location.id){
              return cam
            }
          })[0]
          const prediction = await getPrediction(info.url)
          location.count = prediction
          setRedisKey(location.id.toString(),location,60)
          return {
            source: "TensorFlow",
            id:location.id,
            count:location.count.length,
            countInfo:location.count
        }
      }
      else{
        return location
      }
    }))

  }
  res.status(200).json({countInfo:countInfo,TopTen:topTen})
  }
  catch(err){
    console.log(err)
    res.status(500).send(err)
  }
})

app.listen(port, () => {
  console.log("Server listening on port: ", port);
});

module.exports = app;
