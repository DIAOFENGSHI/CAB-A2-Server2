const tf = require("@tensorflow/tfjs");
const cocoSsd = require("@tensorflow-models/coco-ssd");
var axios = require("axios");
const jpeg = require("jpeg-js");

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
    tf.dispose(input);
    const precise = predictions.filter((predict)=>{
        return predict.class == "car" || predict.class == "truck"
    })
    return precise
  }

exports.getPrediction = getPrediction;
