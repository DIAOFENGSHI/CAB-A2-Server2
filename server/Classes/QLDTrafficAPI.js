var axios = require("axios");
const key_QLDtrafficAPI = "QLDtrafficAPI"
const { getS3Object, putS3Object } = require("./S3");
const bucketName = "n10840044-traffic-aid"

async function fetchQLDTraffic(){
  const config = {
    method: "get",
    url: `https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=${process.env.qldtraffic}`,
  };
  const response = await axios(config)
  return response
}

function checkTimeStamp(apiInfo){
  const day = getDate()
  if(day != apiInfo.validity){return false}
  else{return true}
}

function getDate(){
  const date = new Date(new Date().toUTCString())
  const day = JSON.stringify(date).slice(1,11)
  return day
}

async function fetchQLDTrafficAPI(s3Client){
  // find the key - QLDtrafficAPI, if yes, fetch, check the validity
    var trafficInfo = await getS3Object(bucketName,key_QLDtrafficAPI,s3Client)
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
        position: {
          lat: feature.geometry.coordinates[1],
          lng: feature.geometry.coordinates[0]
        }
      }
    })
      trafficInfo = {source:"QLDTraffic API",validity:getDate(),info:trafficInfo}
    // save to s3
      data = {...trafficInfo}
      data.source = "S3"
      await putS3Object(bucketName,key_QLDtrafficAPI,data,s3Client)
    }
    return trafficInfo
}

exports.fetchQLDTrafficAPI = fetchQLDTrafficAPI;