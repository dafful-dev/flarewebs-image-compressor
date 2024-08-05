import * as AWS from "aws-sdk";
import { Handler } from "aws-lambda";

const sqs = new AWS.SQS();

const handler: Handler = async (event, context) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = event.Records[0].s3.object.key;

  await sqs
    .sendMessage({
      QueueUrl: process.env.QUEUE_URL!,
      MessageBody: JSON.stringify({ bucket, key, createdAt: Date.now() }),
    })
    .promise();
};

export { handler };
