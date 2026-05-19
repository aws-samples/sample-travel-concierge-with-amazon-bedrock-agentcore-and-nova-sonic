import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Knowledge Base Stack — Simplified with S3 Vectors
 *
 * Uses Amazon S3 Vectors as the vector store instead of OpenSearch Serverless.
 * S3 Vectors is built into S3 — no separate collection, index, or access policies needed.
 * Bedrock KB handles embedding, chunking, and vector storage automatically.
 *
 * Steps:
 * 1. Create S3 bucket for policy PDFs + upload them
 * 2. Create S3 vector bucket for embeddings
 * 3. Create IAM role for Bedrock KB
 * 4. Custom Resource Lambda creates: KB → data source → starts ingestion
 */
export class KnowledgeBaseStack extends cdk.Stack {
  public readonly knowledgeBaseId: string;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for policy documents (source data)
    const policyBucket = new s3.Bucket(this, 'PolicyDocsBucket', {
      bucketName: `th-policy-documents-${this.account}-${this.region}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Upload policy PDFs from repo to S3
    new s3deploy.BucketDeployment(this, 'DeployPolicyDocs', {
      sources: [s3deploy.Source.asset('../../backend/policy-documents', {
        exclude: ['.DS_Store', '**/.DS_Store'],
      })],
      destinationBucket: policyBucket,
      retainOnDelete: false,
    });

    // IAM role for Bedrock Knowledge Base service
    // Trust policy must match the exact format from Bedrock docs
    const kbRole = new iam.Role(this, 'KBServiceRole', {
      roleName: 'TH-BedrockKBRole',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    // Add trust policy conditions via escape hatch for exact format control
    const cfnRole = kbRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnRole.addPropertyOverride('AssumeRolePolicyDocument', {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'bedrock.amazonaws.com' },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: { 'aws:SourceArn': `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*` },
        },
      }],
    });

    // Grant KB role access to source S3 bucket
    policyBucket.grantRead(kbRole);

    // Grant KB role access to embedding model
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`],
    }));

    // Grant KB role full S3 Vectors access (needed for Quick create)
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3vectors:*'],
      resources: ['*'],
    }));

    // Grant KMS permissions for transient data storage during ingestion
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
      resources: ['*'],
    }));

    // Custom Resource Lambda to create KB with S3 Vectors
    const kbHandler = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'KBHandler', {
      functionName: 'TH-KnowledgeBaseHandler',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: './lambda/kb-handler/index.mjs',
      handler: 'handler',
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      bundling: {
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
        mainFields: ['module', 'main'],
        minify: false,
        sourceMap: true,
        externalModules: [],
        forceDockerBundling: false,
      },
      environment: {
        KB_ROLE_ARN: kbRole.roleArn,
        BUCKET_ARN: policyBucket.bucketArn,
        REGION: this.region,
        ACCOUNT_ID: this.account,
      },
    });

    kbHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:CreateKnowledgeBase', 'bedrock:DeleteKnowledgeBase',
        'bedrock:GetKnowledgeBase', 'bedrock:ListKnowledgeBases',
        'bedrock:CreateDataSource', 'bedrock:DeleteDataSource',
        'bedrock:GetDataSource', 'bedrock:StartIngestionJob',
      ],
      resources: ['*'],
    }));
    kbHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [kbRole.roleArn],
    }));
    kbHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3vectors:*'],
      resources: ['*'],
    }));

    const provider = new cr.Provider(this, 'KBProvider', {
      onEventHandler: kbHandler,
      logGroup: new logs.LogGroup(this, 'KBProviderLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    const kbResource = new cdk.CustomResource(this, 'KnowledgeBase', {
      serviceToken: provider.serviceToken,
      properties: {
        KBName: 'th-travel-policies',
        Description: 'Travel policy documents',
        DeployTimestamp: new Date().toISOString(),
      },
    });

    this.knowledgeBaseId = kbResource.getAttString('KnowledgeBaseId');
    this.bucketName = policyBucket.bucketName;

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kbResource.getAttString('KnowledgeBaseId'),
      exportName: 'TH-KnowledgeBaseId',
    });
    new cdk.CfnOutput(this, 'PolicyBucketName', {
      value: policyBucket.bucketName,
      exportName: 'TH-PolicyBucketName',
    });
  }
}
