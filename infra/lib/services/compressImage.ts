import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
const sharp = require("sharp");
import { Readable } from "stream";
import * as AWS from "aws-sdk";
import { Handler } from "aws-lambda";

const s3 = new AWS.S3({
  region: process.env.BUCKET_REGION,
});

const s3Client = new S3Client({});

const handler: Handler = async (event, context) => {
  try {
    const bucketName = process.env.BUCKET_NAME;
    const key = event.queryStringParameters.key;

    const keyName = key.split("/").slice(1).join("/");

    const s3Object = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: keyName,
      })
    );

    const streamToBuffer = (stream: Readable): Promise<Buffer> => {
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    };

    const imageBuffer = await streamToBuffer(s3Object.Body as Readable);

    // Compress the image using sharp
    const compressedBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 80 })
      .toBuffer();

    const objName = key.split("/").at(-1);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        ContentType: s3Object.ContentType,
        Body: compressedBuffer,
        Key: `compressed/${objName}`,
      })
    );

    const objectURL = s3.getSignedUrl("getObject", {
      Bucket: bucketName,
      Key: `compressed/${objName}`,
      Expires: 300,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ objectURL }),
    };
  } catch (error) {
    console.log(error);

    return {
      statusCode: 500,
      body: JSON.stringify(error),
    };
  }
};

export { handler };
