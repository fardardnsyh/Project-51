const { DateTime } = require('luxon');
const AWS = require('aws-sdk');
const shortuuid = require('short-uuid');
const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand} = require("@aws-sdk/lib-dynamodb");
const DOCUMENT_TABLE = process.env.DOCUMENT_TABLE;
const MEMORY_TABLE = process.env.MEMORY_TABLE;

const logger = require('./logger');
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async function(event, context) {
    try {
        const user_id = event.requestContext.authorizer.claims.sub;
        const document_id = event.pathParameters.documentid;
        const getCommand = new GetCommand({
            TableName: DOCUMENT_TABLE,
            Key: {
                userid: user_id,
                documentid: document_id
            }
        });
        const response = await docClient.send(getCommand);
        logger.info(response);
        const conversations = response.Item.conversations;
        const conversation_id = shortuuid.generate();
        const timestamp = DateTime.utc();
        const timestamp_str = timestamp.toISO();
        const conversation = {
            conversationid: conversation_id,
            created: timestamp_str
        };
        conversations.push(conversation);
        const updateCommand = new UpdateCommand({
            TableName: DOCUMENT_TABLE,
            Key: {
                userid: user_id,
                documentid: document_id
            },
            UpdateExpression: "SET conversations = :conversations",
            ExpressionAttributeValues: {":conversations": conversations}
        });
        const updateResponse = await docClient.send(updateCommand);
        logger.info(updateResponse);
        const memCommand = new PutCommand({
            TableName: MEMORY_TABLE,
            Item: {
                SessionId: conversation_id,
                History: [],
                messages: [],
            }
        });
        const memResponse = await docClient.send(memCommand);
        logger.info(memResponse);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
            body: JSON.stringify({conversationid: conversation_id})
        };
    } catch (err) {
        logger.error(err);
        throw err;
    }
};
