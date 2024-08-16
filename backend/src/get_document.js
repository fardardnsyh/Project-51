const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient, GetCommand} = require("@aws-sdk/lib-dynamodb");
const logger = require('./logger');

const DOCUMENT_TABLE = process.env.DOCUMENT_TABLE;
const MEMORY_TABLE = process.env.MEMORY_TABLE;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async function(event, context) {
    const user_id = event.requestContext.authorizer.claims.sub;
    const document_id = event.pathParameters.documentid;
    const conversation_id = event.pathParameters.conversationid;

    try {
        const docDetailsCommand = new GetCommand({
            TableName: DOCUMENT_TABLE,
            Key: { userid: user_id, documentid: document_id }
        })
        const docDetailsResponse = await docClient.send(docDetailsCommand);
        logger.info("doc details received");
        const document = docDetailsResponse.Item;
        document.conversations.sort((a, b) => b.created - a.created);
        const getConversationCommand  = new GetCommand({
            TableName: MEMORY_TABLE,
            Key: { SessionId: conversation_id }
        });
        const memoryResponse =  await docClient.send(getConversationCommand);
        logger.info("memory details received");
        const messages = memoryResponse.Item.messages;
        logger.info("Messages are");
        logger.info(messages);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
            body: JSON.stringify(
                {
                    conversationid: conversation_id,
                    document: document,
                    messages: messages
                },
                null,
                2
            )
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
