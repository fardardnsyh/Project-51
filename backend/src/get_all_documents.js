const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient, QueryCommand} = require("@aws-sdk/lib-dynamodb");
const DOCUMENT_TABLE = process.env.DOCUMENT_TABLE;
const logger = require('./logger');
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async function(event, context) {
    const user_id = event.requestContext.authorizer.claims.sub;
    const params = {
        KeyConditionExpression: 'userid = :user_id',
        TableName: DOCUMENT_TABLE,
        ExpressionAttributeValues: {
            ":user_id": user_id
        }
    };
    try {
        const queryCommandForCurrentUser = new QueryCommand(params);
        const documentsForCurrentUser = await docClient.send(queryCommandForCurrentUser);
        const items = documentsForCurrentUser.Items ?
            documentsForCurrentUser.Items.sort((a, b) => b.created - a.created) : [];
        logger.info("All documents Received For user")
        for (let item of items) {
            if(item.conversations && Array.isArray(item.conversations)) {
                item.conversations.sort((a, b) => b.created - a.created);
            }
        }
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*"
            },
            body: JSON.stringify(items, null, 2)
        };
    } catch (err) {
        logger.error(err);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};
