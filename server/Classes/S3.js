async function getS3Object(bucketName,keyName,s3Client){
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

async function putS3Object(bucketName,keyName,date,s3Client){
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

exports.getS3Object = getS3Object;
exports.putS3Object = putS3Object;