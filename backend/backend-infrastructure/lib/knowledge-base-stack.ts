import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

/**
 * Knowledge Base Stack — Bedrock Managed Knowledge Base (fully native CDK)
 *
 * All resources are standard CloudFormation — no Custom Resource Lambdas needed.
 * AWS::Bedrock::DataSource supports type=MANAGED_KNOWLEDGE_BASE_CONNECTOR natively
 * in CloudFormation and CDK aws-cdk-lib 2.261.0+.
 *
 * Resources:
 * 1. S3 bucket — stores policy PDFs (source documents)
 * 2. IAM role — Bedrock KB service role with S3 read access
 * 3. CfnKnowledgeBase — Bedrock Managed KB (service-managed embedding, no vector DB to provision)
 * 4. CfnDataSource — MANAGED_KNOWLEDGE_BASE_CONNECTOR pointing to S3 bucket
 *
 * Cleanup: stack destroy deletes the data source first (implicit CFN dependency via
 * knowledgeBaseId token), then the KB (RemovalPolicy.DESTROY — no data sources left).
 */
export class KnowledgeBaseStack extends cdk.Stack {
  public readonly knowledgeBaseId: string;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Step 1: S3 bucket for policy documents ────────────────────────────────
    const policyBucket = new s3.Bucket(this, 'PolicyDocsBucket', {
      bucketName: `th-policy-documents-${this.account}-${this.region}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    new s3deploy.BucketDeployment(this, 'DeployPolicyDocs', {
      sources: [s3deploy.Source.asset('../../backend/policy-documents', {
        exclude: ['.DS_Store', '**/.DS_Store'],
      })],
      destinationBucket: policyBucket,
      retainOnDelete: false,
    });

    // ── Step 2: IAM service role for Bedrock Managed KB ───────────────────────
    const kbRole = new iam.Role(this, 'KBServiceRole', {
      roleName: 'TH-BedrockKBRole',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    // Scope trust policy conditions as required by Bedrock
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

    policyBucket.grantRead(kbRole);

    // ── Step 3: Bedrock Managed Knowledge Base ────────────────────────────────
    // Type=MANAGED: Bedrock handles vector store, embedding, and reranking.
    // No StorageConfiguration needed — Bedrock manages it automatically.
    // ManagedKnowledgeBaseConfiguration.EmbeddingModelType=MANAGED uses the
    // service-managed embedding model at no extra cost (no Titan access needed).
    const kb = new bedrock.CfnKnowledgeBase(this, 'ManagedKB', {
      name: 'th-travel-policies',
      description: 'Travel Concierge airline policy documents',
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'MANAGED',
      } as bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty,
    });
    // The AWS docs explicitly state: when embeddingModelType=MANAGED, you must NOT
    // specify embeddingModelArn. The CDK type incorrectly requires embeddingModelArn,
    // so addPropertyOverride is used to emit exactly what the API expects:
    // { Type: MANAGED, ManagedKnowledgeBaseConfiguration: { EmbeddingModelType: MANAGED } }
    // Benefits: free managed reranker, service manages model upgrades, no InvokeModel IAM needed.
    kb.addPropertyOverride('KnowledgeBaseConfiguration', {
      Type: 'MANAGED',
      ManagedKnowledgeBaseConfiguration: { EmbeddingModelType: 'MANAGED' },
    });
    kb.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // ── Step 4: S3 data source (native CfnDataSource — no Lambda needed) ──────
    // AWS::Bedrock::DataSource supports MANAGED_KNOWLEDGE_BASE_CONNECTOR natively.
    // CFN creates the data source and handles deletion in the correct order
    // (data source deleted before KB because knowledgeBaseId creates a dependency).
    const dataSource = new bedrock.CfnDataSource(this, 'PolicyDataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: 'th-policy-documents',
      description: 'SkyWave Airlines policy PDFs',
      dataSourceConfiguration: {
        type: 'MANAGED_KNOWLEDGE_BASE_CONNECTOR',
        managedKnowledgeBaseConnectorConfiguration: {
          connectorParameters: {
            type: 'S3',
            version: '1',
            connectionConfiguration: {
              bucketName: policyBucket.bucketName,
              bucketOwnerAccountId: this.account,
            },
          },
        },
      } as bedrock.CfnDataSource.DataSourceConfigurationProperty,
      dataDeletionPolicy: 'RETAIN',
      // SMART_PARSING: uses Amazon Bedrock Data Automation to extract text from PDFs
      // with complex layouts (tables, columns, headers) more accurately than the default parser.
      // Recommended for policy documents with structured content.
      vectorIngestionConfiguration: {
        parsingConfiguration: {
          parsingStrategy: 'SMART_PARSING',
        },
      },
    });
    // Explicit dependency ensures CFN deletes the data source before the KB
    dataSource.addDependency(kb);

    // ── Outputs ───────────────────────────────────────────────────────────────
    this.knowledgeBaseId = kb.attrKnowledgeBaseId;
    this.bucketName = policyBucket.bucketName;

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kb.attrKnowledgeBaseId,
      exportName: 'TH-KnowledgeBaseId',
    });
    new cdk.CfnOutput(this, 'PolicyBucketName', {
      value: policyBucket.bucketName,
      exportName: 'TH-PolicyBucketName',
    });
  }
}
