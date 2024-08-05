import * as AWS from "aws-sdk";
import { Handler } from "aws-lambda";

const s3 = new AWS.S3({
  region: process.env.BUCKET_REGION,
});

const handler: Handler = async (event, context) => {
  const bucketName = process.env.BUCKET_NAME;

  const contentType = decodeURIComponent(
    event.queryStringParameters.contentType
  );
  const fileName = decodeURIComponent(event.queryStringParameters.fileName);

  const ext = fileName.split(".").at(-1);

  const uploadUrl = await s3.getSignedUrlPromise("putObject", {
    Bucket: bucketName,
    Key: `uploads/${Date.now()}.${ext}`,
    Expires: 300,
    ContentType: contentType,
  });

  return {
    statusCode: 200,
    isBase64Encoded: false,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ uploadUrl }),
  };
};

export { handler };
