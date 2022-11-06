var express = require("express");
var cors = require("cors");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
require("dotenv").config();
const AWS = require("aws-sdk");
const port = "8002";
const bucketName = "n10840044-traffic-aid";
const key_TopTen = "TopTen";
const s3Client = new AWS.S3({ apiVersion: "2006-03-01" });
var redisClient = null;
var app = express();

const { includesNullValue, addCount } = require("./Classes/TrafficAid");
const { fetchQLDTrafficAPI } = require("./Classes/QLDTrafficAPI");
const {
  createRedisClient,
  getRedisKey,
  setRedisKey,
} = require("./Classes/Redis");
const { getS3Object, putS3Object } = require("./Classes/S3");
const { getPrediction } = require("./Classes/TensorFlow");

(async () => {
  try {
    redisClient = await createRedisClient();
  } catch (err) {
    console.log(err);
  }
})();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());

app.post("/traffic", async (req, res) => {
  try {
    const locations = req.body;
    // get top ten from S3
    var toptenInfo = await getS3Object(bucketName, key_TopTen, s3Client);
    // add top ten by the locations
    const data = addCount(locations, toptenInfo);
    // save top ten to S3
    await putS3Object(bucketName, key_TopTen, data, s3Client);
    const topTen = { source: "Processed", data: data.slice(0, 10) };
    // check in redis
    var countInfo = await Promise.all(
      locations.map(async (ID) => {
        const count = await getRedisKey(ID.toString(), redisClient);
        if (count == null) {
          return { id: ID, count: count };
        } else {
          return JSON.parse(count);
        }
      })
    );
    // check if results include null value or not
    if (includesNullValue(countInfo)) {
      const trafficInfo = await fetchQLDTrafficAPI(s3Client);
      countInfo = await Promise.all(
        countInfo.map(async (location) => {
          if (location.count == null) {
            const info = trafficInfo.info.filter((cam) => {
              if (cam.id == location.id) {
                return cam;
              }
            })[0];
            const prediction = await getPrediction(info.url);
            location.count = prediction;
            // save to redis first
            setRedisKey(location.id.toString(), location, 60, redisClient);
            return {
              source: "TensorFlow",
              id: location.id,
              count: location.count.length,
              countInfo: location.count,
            };
          } else {
            return location;
          }
        })
      );
    }
    res.status(200).json({ countInfo: countInfo, TopTen: topTen });
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.listen(port, () => {
  console.log("Server listening on port: ", port);
});

module.exports = app;
