const redis = require("redis");

async function createRedisClient(){
    // ./redis-cli -h n10840044.km2jzi.ng.0001.apse2.cache.amazonaws.com -p 6379
// ./redis-cli -h master.traffic-aid.km2jzi.apse2.cache.amazonaws.com --tls -a 0bc4041c48a71d35b9389055

    // Redis setup
const url = `rediss://master.traffic-aid.km2jzi.apse2.cache.amazonaws.com:6379`;
const redisClient = redis.createClient({
    url,
    password: process.env.redis_tls
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

return redisClient
}

async function getRedisKey(keyName,redisClient){
  try{
    const result = await redisClient.get(keyName);
    return result
  }
  catch(err){
    throw err
  }
}

async function setRedisKey(keyName,content,ttl,redisClient){
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

exports.createRedisClient = createRedisClient;
exports.getRedisKey = getRedisKey;
exports.setRedisKey = setRedisKey;


