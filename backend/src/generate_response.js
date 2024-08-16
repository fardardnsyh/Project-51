const {BedrockRuntimeClient} = require("@aws-sdk/client-bedrock-runtime");
const { Bedrock } = require("@langchain/community/llms/bedrock");
const {BedrockEmbeddings} = require("@langchain/community/embeddings/bedrock");
const {PineconeClient} = require("@pinecone-database/pinecone");
const {PineconeStore} = require("langchain/vectorstores/pinecone");
const {ConversationalRetrievalQAChain} = require("langchain/chains");
const {HumanChatMessage, AIChatMessage} = require("langchain/schema");
const logger = require('./logger');
const constants = require('./constants');

const MEMORY_TABLE = process.env.MEMORY_TABLE;

const { DynamoDBChatMessageHistory } = require("langchain/stores/message/dynamodb");
const bedrockRuntimeClient = new BedrockRuntimeClient({ region: constants.REGION });

exports.handler = async function(event, context) {
    const eventBody = JSON.parse(event.body);
    const human_input = eventBody.prompt;
    const conversation_id = event.pathParameters.conversationid;
    const documentid = event.pathParameters.documentid;
    logger.info("Data extracted successfully")
    const embeddings = new BedrockEmbeddings({
        model_id: constants.MODEL_ID,
        client: bedrockRuntimeClient,
        region: constants.REGION,
    });

    logger.info("Data Extracted")

    // create a bedrock llm using langchain
    const llm = new Bedrock({
        model_id: constants.MODEL_ID,
        region: constants.REGION,
    });

    logger.info("created a bedrock llm using langchain")

    const pineconeClient = new PineconeClient();
    await pineconeClient.init({
        apiKey: constants.API_KEY,
        environment: constants.PINECONE_ENV,
    });
    const index = pineconeClient.Index(constants.PINECONE_INDEX_NAME);
    const vectorStore =  await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex: index,
        textKey: "text",
        namespace: documentid,
    });

    logger.info("vectorstore created")

    const chatHistory = new DynamoDBChatMessageHistory({
        tableName: MEMORY_TABLE,
        sessionId: conversation_id,
        partitionKey: "SessionId"
    });

    const chatRes = await chatHistory.getMessages();
    const history = chatRes.map(msg => msg.content).join("\n");

    const qa = ConversationalRetrievalQAChain.fromLLM(
        llm, vectorStore.asRetriever(), {
            returnSourceDocuments: true
        }
    );

    logger.info("qa created")

    try {

        const res = await qa.call({question: human_input, chat_history : history})
        logger.info(res);

        const hChatMessage = await chatHistory.addMessage(new HumanChatMessage(human_input))
        const aiChatMessage = await chatHistory.addMessage(new AIChatMessage(res.text))

        logger.info("Updated the conversations")

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
            body: JSON.stringify(res.text)
        };
    }
    catch (error) {
        logger.info("Error occurred");
        throw error;
    }
};
