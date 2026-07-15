#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';

const app = new cdk.App();

// Get API Gateway ID from context (passed via --context or API_GATEWAY_ID env var)
const apiGatewayId = app.node.tryGetContext('apiGatewayId') || process.env.API_GATEWAY_ID;
if (!apiGatewayId) {
  throw new Error('API Gateway ID is required. Pass via --context apiGatewayId=xxx or API_GATEWAY_ID env var');
}

// Get Knowledge Base ID from context (passed via --context or KNOWLEDGE_BASE_ID env var)
const knowledgeBaseId = app.node.tryGetContext('knowledgeBaseId') || process.env.KNOWLEDGE_BASE_ID;
if (!knowledgeBaseId) {
  throw new Error('Knowledge Base ID is required. Pass via --context knowledgeBaseId=xxx or KNOWLEDGE_BASE_ID env var');
}

new CdkStack(app, 'TH-AgentCoreGatewayStack', {
  apiGatewayId,
  knowledgeBaseId,
  stage: 'prod',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

cdk.Tags.of(app).add('auto-delete', 'no');
cdk.Tags.of(app).add('project', 'travel-concierge');
