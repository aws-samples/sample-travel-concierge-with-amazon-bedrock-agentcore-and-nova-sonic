#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { KnowledgeBaseStack } from '../lib/knowledge-base-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { ApiGatewayStack } from '../lib/api-gateway-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Section A: Backend Infrastructure
// Deploy order: DynamoDB + Cognito + KB (parallel) → Lambda → ApiGateway

const dynamodbStack = new DynamoDBStack(app, 'TH-DynamoDBStack', { env });

const cognitoStack = new CognitoStack(app, 'TH-CognitoStack', { env });

const knowledgeBaseStack = new KnowledgeBaseStack(app, 'TH-KnowledgeBaseStack', { env });

const lambdaStack = new LambdaStack(app, 'TH-LambdaStack', {
  env,
  tables: dynamodbStack.tables,
  knowledgeBaseId: knowledgeBaseStack.knowledgeBaseId,
});
lambdaStack.addDependency(dynamodbStack);
lambdaStack.addDependency(knowledgeBaseStack);

const apiGatewayStack = new ApiGatewayStack(app, 'TH-ApiGatewayStack', {
  env,
  functions: lambdaStack.functions,
});
apiGatewayStack.addDependency(lambdaStack);
apiGatewayStack.addDependency(cognitoStack);

// Apply tags to all resources across all stacks
cdk.Tags.of(app).add('auto-delete', 'no');
cdk.Tags.of(app).add('project', 'travel-concierge');
