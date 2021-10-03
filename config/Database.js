  
const AWS = require('aws-sdk')
AWS.config.update({region: process.env.REGION })

const ddb = new AWS.DynamoDB() 

module.exports = ddb