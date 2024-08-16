const shortuuid = require('short-uuid');
const {HeadObjectCommand, PutObjectCommand, S3Client} = require("@aws-sdk/client-s3");
const {getSignedUrl} = require("@aws-sdk/s3-request-presigner");
const logger = require('./logger');
const BUCKET = process.env.BUCKET;
const REGION = process.env.REGION;
const client = new S3Client({REGION});

const createPresignedUrlWithClient = ({ bucket, key }) => {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: 3600 });
};

exports.handler = async function(event, context) {
    const user_id = event.requestContext.authorizer.claims.sub;
    const file_name_full = event.queryStringParameters.file_name;
    const file_name = file_name_full.split('.pdf')[0];
    let exists = false;
    try {
        const headObjectCommand = new HeadObjectCommand({
            Bucket: BUCKET,
            Key: file_name_full
        })
        const response = await client.send(headObjectCommand)
        exists = true;
    } catch (error) {
        logger.info("File Not present");
        logger.info(error);
    }
    let key;
    if (exists) {
        const suffix = shortuuid.generate().substring(0, 4);
        key = `${user_id}/${file_name}-${suffix}.pdf/${file_name}-${suffix}.pdf`;
    } else {
        key = `${user_id}/${file_name}.pdf/${file_name}.pdf`;
    }
    logger.info(key);
    try {
        const resigned_url = await createPresignedUrlWithClient({
            bucket: BUCKET,
            key: key,
        });
        logger.info(resigned_url);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': '*'
            },
            body: JSON.stringify({ presignedurl: resigned_url })
        };
    } catch (err) {
        console.error(err);
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


