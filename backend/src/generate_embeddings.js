const { PineconeClient} = require("@pinecone-database/pinecone");
const {PDFLoader} = require("langchain/document_loaders/fs/pdf");
const {RecursiveCharacterTextSplitter} = require("langchain/text_splitter");
const {BedrockRuntimeClient, InvokeModelCommand} = require("@aws-sdk/client-bedrock-runtime");
const {PineconeStore} = require("langchain/vectorstores/pinecone");
const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient, UpdateCommand} = require("@aws-sdk/lib-dynamodb");
const {GetObjectCommand, S3Client} = require("@aws-sdk/client-s3");
const { writeFile} = require("node:fs/promises");
const logger = require('./logger');
const constants = require('./constants');
const { BedrockEmbeddings } = require("@langchain/community/embeddings/bedrock");
const DOCUMENT_TABLE = process.env.DOCUMENT_TABLE;
const s3Client = new S3Client({});
const BUCKET = process.env.BUCKET;
const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const bedrockRuntimeClient = new BedrockRuntimeClient({
    region: "us-east-1",
});


async function embedAndStoreDocs(docId, docs) {
    /*create and store the embeddings in the vectorStore*/
    try {
        logger.info("embedAndStoreDocs started")
        const embeddings = new BedrockEmbeddings({
            model_id: constants.MODEL_ID,
            client: bedrockRuntimeClient,
            region: constants.REGION,
        });
        const pineconeClient = new PineconeClient();
        await pineconeClient.init({
            apiKey: constants.API_KEY,
            environment: constants.PINECONE_ENV,
        });
        const index = pineconeClient.Index(constants.PINECONE_INDEX_NAME);
        // Embed the PDF documents
        await PineconeStore.fromDocuments(docs, embeddings, {
            pineconeIndex: index,
            namespace : docId,
            textKey: "text"
        });
    } catch (error) {
        logger.info("embedAndStoreDocs failed")
        throw error;
    }
}

async function setDocStatus(user_id, document_id, status) {
    logger.info(`Updating document status for ${user_id} and ${document_id} to ${status}`);
    const command = new UpdateCommand({
        TableName: DOCUMENT_TABLE,
        Key: {userid: user_id, documentid: document_id},
        UpdateExpression: "set docstatus = :docstatus",
        ExpressionAttributeValues: {
            ":docstatus": status,
        },
    });
    const response = await docClient.send(command);
    logger.info(response);
}

async function getS3Object(key, file_name_full) {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });
    logger.info(command);
    try {
        const { Body }  = await s3Client.send(command);
        return await writeFile(`/tmp/${file_name_full}`, Body);
    } catch (err) {
        console.error(err);
    }
}

async function getChunkedDocsFromPDF(file_name_full) {
    try {
        const loader = new PDFLoader(`/tmp/${file_name_full}`);
        const docs = await loader.load();
        // From the docs https://www.pinecone.io/learn/chunking-strategies/
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        return await textSplitter.splitDocuments(docs);
    } catch (e) {
        console.error(e);
        throw new Error("PDF docs chunking failed !");
    }
}


exports.handler = async function(event, context) {
    // Extracting Relevant Details
    const eventBody = JSON.parse(event.Records[0].body);
    const document_id = eventBody.documentid;
    const user_id = eventBody.user;
    const key = eventBody.key;
    const file_name_full = key.split('/').pop();
    try {
        await setDocStatus(user_id, document_id, constants.PROCESSING_STATUS);
        await getS3Object(key, file_name_full);
        logger.info("S3 object retrieved");
        logger.info("Preparing chunks from PDF file");
        const docs = await getChunkedDocsFromPDF(file_name_full);
        logger.info(`Loading ${docs.length} chunks into pinecone...`);
        await embedAndStoreDocs(document_id, docs);
        logger.info("Data embedded and stored in pine-cone index");
        await setDocStatus(user_id, document_id, constants.READY_STATUS);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
        };
    } catch (error) {
        console.error("Init client script failed ", error);
        await setDocStatus(user_id, document_id, constants.FAILED_STATUS);
        throw error;
    }
};
