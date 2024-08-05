import * as AWS from "aws-sdk";
import { Handler } from "aws-lambda";

const sqs = new AWS.SQS();
const s3 = new AWS.S3({
  region: process.env.BUCKET_REGION,
});

const handler: Handler = async (event, context) => {
  try {
    const params = {
      QueueUrl: process.env.QUEUE_URL!,
      MaxNumberOfMessages: 1,
      VisibilityTimeout: 0,
      WaitTimeSeconds: 0,
    };

    const data = await sqs.receiveMessage(params).promise();

    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0];
      const body = JSON.parse(message.Body!);

      const { bucket, key, createdAt } = body;

      const currentTime = new Date();
      const messageTime = new Date(createdAt);
      const timeDifference = currentTime.getTime() - messageTime.getTime();
      const hoursDifference = Math.floor(timeDifference / (1000 * 60 * 60));

      if (hoursDifference >= 1) {
        await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

export { handler };
