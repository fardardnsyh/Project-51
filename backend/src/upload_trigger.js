const shortuuid = require('short-uuid');
const logger = require('./logger');
const constants = require("./constants");
const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {PutCommand, DynamoDBDocumentClient} = require("@aws-sdk/lib-dynamodb");
const {SendMessageCommand, SQSClient} = require("@aws-sdk/client-sqs");

const DOCUMENT_TABLE = process.env.DOCUMENT_TABLE;
const MEMORY_TABLE = process.env.MEMORY_TABLE;
const QUEUE = process.env.QUEUE;

const sqsClient = new SQSClient({});
const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);


exports.handler = async function(event, context) {
    const key = decodeURIComponent(event.Records[0].s3.object.key);
    const split = key.split("/");
    const user_id = split[0];
    const file_name = split[1];
    const document_id = shortuuid.uuid();
    const conversation_id = shortuuid.uuid();
    const timestamp = new Date();
    const timestamp_str = timestamp.toISOString();

    // Structure of DynamoDB Table
    const document = {
        userid: user_id,
        documentid: document_id,
        filename: file_name,
        created: timestamp_str,
        filesize: decodeURIComponent(event.Records[0].s3.object.size).toString(),
        docstatus: constants.UPLOADED_STATUS,
        conversations: []
    };
    const conversation = { conversationid: conversation_id, created: timestamp_str };
    document.conversations.push(conversation);

    //Adding the details to Document Dynamo DB Table
    const docTableCommand = new PutCommand({
        TableName: DOCUMENT_TABLE,
        Item: document
    });
    const docTableResponse = await docClient.send(docTableCommand);
    logger.info("Successfully added the details to Document Dynamo DB Table")

    // Adding details to Memory Dynamo DB table
    const memory = {
        SessionId: conversation_id,
        History: [],
        messages: [],
    };
    const memTableCommand = new PutCommand({
        TableName: MEMORY_TABLE,
        Item: memory
    });
    const memTableResponse = await docClient.send(memTableCommand);
    logger.info("Successfully added the details to Memory Dynamo DB Table")


    // Pushing the details to the SQS queue for embedding
    const message = { documentid: document_id, key: key, user: user_id };
    const command = new SendMessageCommand({
        QueueUrl: QUEUE,
        MessageBody: JSON.stringify(message)
    });
    const response = await sqsClient.send(command);
    console.log(response);
};