'use strict';

const { Worker } = require('worker_threads')
const db = require("./config/Database")
const dynamoDataTypeWrapper = require('dynamodb-data-types');
const { default: axios } = require('axios');
const cheerio = require('cheerio');
const { v4 } = require("uuid")


var cpuCount = require('os').cpus().length;


const getLinks = (indice, totalItemPerThread) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js')
    worker.once('message', (message) => {
      resolve(message.links)
    })
    worker.on('error', (error) => {
      console.log(error)
      reject()
    })
    worker.postMessage({ page: indice, totalItemPerThread })
  })
}

module.exports.processItem = async (event, context, callback) => {
  const itensWriteBatch = []

  const records = event.Records;
  for (let indice = 0; indice < records.length; indice++) {
    const record = records[indice];
    if (record.eventName != "INSERT") {
      continue;
    }

    let data = dynamoDataTypeWrapper.AttributeValue.unwrap(record.dynamodb.NewImage);
    const response = await axios.get(data.link)
    const html = response.data;
    const $ = cheerio.load(html);

    data.id = v4()
    data.title = $(".short-description > h1").text();
    data.image = $(".photo-figure > img").attr("src");
    data.price = $(".default-price > span > strong").text()
    data.price = data.price.replace("R$", "").trim()

    itensWriteBatch.push(
      {
        PutRequest: {
          Item: {
            ...dynamoDataTypeWrapper.AttributeValue.wrap(data)
          }
        }
      }
    );

  }

  const params = {
    RequestItems: {
      "poc-webcrawler-scaled-extracted-products-staging": [...itensWriteBatch]
    }
  }

  try {
    await db.batchWriteItem(params).promise();
  } catch (error) {
    console.log(error)
  } finally {
    callback(null);
  }

}

// One process is 70820ms to 60 urls
// Using work thread with many processes is 15000ms to 60 urls
module.exports.hello = async (event) => {
  try {
    const workers = [];
    const totalItemPerThread = (Math.ceil(60 / cpuCount))
    for (let indice = 0; indice <= totalItemPerThread; indice++) {
      workers.push(getLinks(indice, totalItemPerThread))
    }

    const links = await Promise.all(workers)
    let linksOk = [];
    links.forEach(item => {
      if (item.length > 0) {
        linksOk = linksOk.concat(item)
      }
    })

    let itemInBatch = []
    for (let indice = 0; indice <= linksOk.length; indice++) {
      const item = linksOk[indice];
      itemInBatch.push(
        {
          PutRequest: {
            Item: {
              ...dynamoDataTypeWrapper.AttributeValue.wrap(item)
            }
          }
        }
      );

      if (itemInBatch.length == 24) {
        const params = {
          RequestItems: {
            "poc-webcrawler-scaled-links-products-staging": [...itemInBatch]
          }
        }

        try {
          await db.batchWriteItem(params).promise();
          itemInBatch = []
        } catch (error) {
          console.log(error)
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        links: linksOk
      })
    }
  } catch (error) {
    console.log(error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Interval server error"
      })
    }
  }

};
