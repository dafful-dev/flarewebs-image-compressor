import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export class DeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket
    const bucket = new s3.Bucket(this, "ImageCompressorBucket", {
      bucketName: "fiifidev-image-compressor",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create SQS queue
    const imageDeleteQueue = new sqs.Queue(this, "ImageDeleteQueue");

    // Configure CORS for the bucket
    bucket.addCorsRule({
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
    });

    // Create Lambda function for cleaning up expired objects
    const cleanupLambda = new NodejsFunction(this, "CleanupLambda", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler",
      entry: path.join(__dirname, "services", "deleteExpiredObjects.ts"),
      environment: {
        QUEUE_URL: imageDeleteQueue.queueUrl,
        BUCKET_NAME: bucket.bucketName,
        BUCKET_REGION: this.region,
      },
      bundling: {
        forceDockerBundling: true,
      },
    });

    // Create Lambda function for generating S3 put URL
    const generateS3PutUrlLambda = new NodejsFunction(
      this,
      "GenerateS3PutUrlLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "handler",
        entry: path.join(__dirname, "services", "generateS3PutUrl.ts"),
        environment: {
          BUCKET_NAME: bucket.bucketName,
          BUCKET_REGION: this.region,
        },
        bundling: {
          forceDockerBundling: true,
        },
      }
    );

    // Create Lambda function for compressing images
    const compressImageLambda = new NodejsFunction(
      this,
      "CompressImageLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "handler",
        entry: path.join(__dirname, "services", "compressImage.ts"),
        environment: {
          BUCKET_NAME: bucket.bucketName,
          BUCKET_REGION: this.region,
        },
        bundling: {
          nodeModules: ["sharp"],
          forceDockerBundling: true,
        },
        memorySize: 256,
        timeout: cdk.Duration.minutes(2),
      }
    );

    // Create Lambda function for testing
    const testLambda = new NodejsFunction(this, "TestLambda", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "handler",
      entry: path.join(__dirname, "services", "getTestRoute.ts"),
      bundling: {
        forceDockerBundling: true,
      },
    });

    // Create Lambda function for publishing to delete queue
    const publishToDeleteQueueLambda = new NodejsFunction(
      this,
      "PublishToDeleteQueueLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "handler",
        environment: {
          QUEUE_URL: imageDeleteQueue.queueUrl,
        },
        entry: path.join(__dirname, "services", "publishToDeleteQueue.ts"),
        bundling: {
          forceDockerBundling: true,
        },
      }
    );

    // Grant permission to send messages to the delete queue
    imageDeleteQueue.grantSendMessages(publishToDeleteQueueLambda);
    imageDeleteQueue.grantConsumeMessages(cleanupLambda);

    // Create HTTP API
    const imageCompressorAPI = new apigwv2.HttpApi(this, "ImageCompressorAPI", {
      corsPreflight: {
        allowHeaders: ["Authorization"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowOrigins: ["*"],
        maxAge: cdk.Duration.days(10),
      },
    });

    // Create integrations for API routes
    const generateS3PutUrlIntegration = new HttpLambdaIntegration(
      "GenerateS3PutUrlIntegration",
      generateS3PutUrlLambda
    );

    const compressImageIntegration = new HttpLambdaIntegration(
      "CompressImageIntegration",
      compressImageLambda
    );

    const testIntegration = new HttpLambdaIntegration(
      "testIntegration",
      testLambda
    );

    // Add routes to the API
    imageCompressorAPI.addRoutes({
      path: "/test",
      methods: [apigwv2.HttpMethod.GET],
      integration: testIntegration,
    });

    imageCompressorAPI.addRoutes({
      path: "/generate-upload-url",
      methods: [apigwv2.HttpMethod.GET],
      integration: generateS3PutUrlIntegration,
    });

    imageCompressorAPI.addRoutes({
      path: "/compress-image",
      methods: [apigwv2.HttpMethod.GET],
      integration: compressImageIntegration,
    });

    // Configure S3 event notification
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new LambdaDestination(publishToDeleteQueueLambda)
    );

    // Grant read/write permissions to the Lambda functions
    bucket.grantReadWrite(generateS3PutUrlLambda);
    bucket.grantReadWrite(compressImageLambda);
    bucket.grantReadWrite(cleanupLambda);

    // Create EventBridge rule to run Lambda function daily
    const dailyRule = new events.Rule(this, "DailyRule", {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
    });

    dailyRule.addTarget(new targets.LambdaFunction(publishToDeleteQueueLambda));
  }
}
