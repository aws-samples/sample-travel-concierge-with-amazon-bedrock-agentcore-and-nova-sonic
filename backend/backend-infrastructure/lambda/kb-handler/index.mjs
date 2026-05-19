/**
 * Knowledge Base Custom Resource Handler — S3 Vectors
 *
 * Steps:
 * 1. Create S3 vector bucket
 * 2. Create vector index (1024 dimensions for Titan Embed V2, cosine metric)
 * 3. Wait for IAM role propagation
 * 4. Create Bedrock Knowledge Base with S3 Vectors storage
 * 5. Wait for KB to become ACTIVE
 * 6. Create S3 data source
 * 7. Start ingestion job
 */
import {
  S3VectorsClient,
  CreateVectorBucketCommand, DeleteVectorBucketCommand,
  CreateIndexCommand, DeleteIndexCommand,
  GetVectorBucketCommand,
} from '@aws-sdk/client-s3vectors';
import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand, DeleteKnowledgeBaseCommand, GetKnowledgeBaseCommand,
  CreateDataSourceCommand, DeleteDataSourceCommand, UpdateDataSourceCommand, GetDataSourceCommand,
  StartIngestionJobCommand, ListDataSourcesCommand, ListKnowledgeBasesCommand,
} from '@aws-sdk/client-bedrock-agent';

const s3v = new S3VectorsClient();
const bedrockClient = new BedrockAgentClient();

const REGION = process.env.REGION;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const KB_ROLE_ARN = process.env.KB_ROLE_ARN;
const BUCKET_ARN = process.env.BUCKET_ARN;
const EMBEDDING_MODEL = `arn:aws:bedrock:${REGION}::foundation-model/amazon.titan-embed-text-v2:0`;

const VECTOR_BUCKET_NAME = 'th-policy-vectors';
const VECTOR_INDEX_NAME = 'th-policy-index';

export async function handler(event) {
  const props = event.ResourceProperties;
  const { KBName, Description } = props;

  console.log(`RequestType: ${event.RequestType}`);

  try {
    if (event.RequestType === 'Create') {
      return await create(KBName, Description);
    } else if (event.RequestType === 'Update') {
      const kbId = event.PhysicalResourceId;
      try {
        const ds = await bedrockClient.send(new ListDataSourcesCommand({ knowledgeBaseId: kbId }));
        const dsId = ds.dataSourceSummaries?.[0]?.dataSourceId;
        if (dsId) {
          await bedrockClient.send(new StartIngestionJobCommand({ knowledgeBaseId: kbId, dataSourceId: dsId }));
        }
      } catch (e) { console.log(`Update sync: ${e.message}`); }
      return { PhysicalResourceId: kbId, Data: { KnowledgeBaseId: kbId } };
    } else if (event.RequestType === 'Delete') {
      await cleanup(event.PhysicalResourceId);
      return { PhysicalResourceId: event.PhysicalResourceId };
    }
  } catch (e) {
    console.error('Error:', e);
    throw e;
  }
}

async function create(kbName, description) {
  // Step 1: Create S3 vector bucket
  console.log('Creating S3 vector bucket...');
  try {
    await s3v.send(new CreateVectorBucketCommand({
      vectorBucketName: VECTOR_BUCKET_NAME,
    }));
    console.log('Vector bucket created');
  } catch (e) {
    if (e.name === 'BucketAlreadyExists' || e.name === 'ConflictException' || e.message?.includes('already exists')) {
      console.log('Vector bucket already exists, continuing...');
    } else throw e;
  }

  // Get vector bucket ARN
  const bucketInfo = await s3v.send(new GetVectorBucketCommand({ vectorBucketName: VECTOR_BUCKET_NAME }));
  const vectorBucketArn = bucketInfo.vectorBucket.vectorBucketArn;
  console.log(`Vector bucket ARN: ${vectorBucketArn}`);

  // Step 2: Create vector index (1024 dimensions for Titan Embed V2)
  console.log('Creating vector index...');
  try {
    await s3v.send(new CreateIndexCommand({
      vectorBucketName: VECTOR_BUCKET_NAME,
      indexName: VECTOR_INDEX_NAME,
      dimension: 1024,
      distanceMetric: 'cosine',
      dataType: 'float32',
    }));
    console.log('Vector index created');
  } catch (e) {
    if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
      console.log('Vector index already exists, continuing...');
    } else throw e;
  }

  const indexArn = `${vectorBucketArn}/index/${VECTOR_INDEX_NAME}`;
  console.log(`Vector index ARN: ${indexArn}`);

  // Step 3: Wait for IAM role propagation
  console.log('Waiting 30s for IAM role propagation...');
  await sleep(30000);

  // Step 4: Create Bedrock Knowledge Base (or reuse existing one with same name)
  console.log('Creating Bedrock Knowledge Base...');
  let kbId;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const kbResp = await bedrockClient.send(new CreateKnowledgeBaseCommand({
        name: kbName,
        description,
        roleArn: KB_ROLE_ARN,
        knowledgeBaseConfiguration: {
          type: 'VECTOR',
          vectorKnowledgeBaseConfiguration: {
            embeddingModelArn: EMBEDDING_MODEL,
          },
        },
        storageConfiguration: {
          type: 'S3_VECTORS',
          s3VectorsConfiguration: {
            vectorBucketArn: vectorBucketArn,
            indexArn: indexArn,
          },
        },
      }));
      kbId = kbResp.knowledgeBase.knowledgeBaseId;
      console.log('KB created successfully');
      break;
    } catch (e) {
      if (e.message?.includes('unable to assume') && attempt < 4) {
        console.log(`Role not yet propagated, retrying in 30s (attempt ${attempt + 1}/5)...`);
        await sleep(30000);
      } else if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
        // KB with this name already exists — find and reuse it
        console.log('KB already exists, finding existing one...');
        kbId = await findExistingKB(kbName);
        if (kbId) {
          console.log(`Reusing existing KB: ${kbId}`);
          break;
        }
        throw new Error(`KB "${kbName}" already exists but could not be found via ListKnowledgeBases`);
      } else {
        throw e;
      }
    }
  }

  console.log(`Knowledge Base ID: ${kbId}`);

  // Step 5: Wait for KB to become ACTIVE
  console.log('Waiting for Knowledge Base to become ACTIVE...');
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const status = await bedrockClient.send(new GetKnowledgeBaseCommand({ knowledgeBaseId: kbId }));
    const kbStatus = status.knowledgeBase?.status;
    console.log(`  KB status: ${kbStatus} (attempt ${i + 1}/60)`);
    if (kbStatus === 'ACTIVE') break;
    if (kbStatus === 'FAILED') throw new Error('Knowledge Base creation failed');
  }

  // Step 6: Create S3 data source (or reuse existing one)
  console.log('Creating data source...');
  let dsId;
  try {
    const dsResp = await bedrockClient.send(new CreateDataSourceCommand({
      knowledgeBaseId: kbId,
      name: 'th-policy-documents',
      description: 'S3 bucket with airline policy PDFs',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: { bucketArn: BUCKET_ARN },
      },
    }));
    dsId = dsResp.dataSource.dataSourceId;
    console.log(`Data source created: ${dsId}`);
  } catch (e) {
    if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
      console.log('Data source already exists, finding existing one...');
      const existing = await bedrockClient.send(new ListDataSourcesCommand({ knowledgeBaseId: kbId }));
      dsId = existing.dataSourceSummaries?.[0]?.dataSourceId;
      if (dsId) {
        console.log(`Reusing existing data source: ${dsId}`);
      } else {
        throw new Error('Data source already exists but could not be found');
      }
    } else {
      throw e;
    }
  }

  // Step 7: Start ingestion
  console.log('Starting ingestion job...');
  await bedrockClient.send(new StartIngestionJobCommand({
    knowledgeBaseId: kbId,
    dataSourceId: dsId,
  }));
  console.log('Ingestion job started');

  return {
    PhysicalResourceId: kbId,
    Data: { KnowledgeBaseId: kbId, DataSourceId: dsId, VectorBucketArn: vectorBucketArn },
  };
}

/**
 * Find an existing Knowledge Base by name.
 * Lists all KBs and returns the ID of the one matching the given name.
 */
async function findExistingKB(kbName) {
  let nextToken;
  do {
    const resp = await bedrockClient.send(new ListKnowledgeBasesCommand({
      ...(nextToken ? { nextToken } : {}),
    }));
    for (const kb of resp.knowledgeBaseSummaries || []) {
      if (kb.name === kbName) {
        return kb.knowledgeBaseId;
      }
    }
    nextToken = resp.nextToken;
  } while (nextToken);
  return null;
}

async function cleanup(kbId) {
  if (!kbId || kbId === 'not-created') return;
  console.log(`Cleaning up KB: ${kbId}`);

  // Delete data sources + KB
  // Set dataDeletionPolicy to RETAIN first so Bedrock skips vector store cleanup
  // (avoids "Unable to delete data from vector store" errors)
  try {
    const ds = await bedrockClient.send(new ListDataSourcesCommand({ knowledgeBaseId: kbId }));
    for (const source of ds.dataSourceSummaries || []) {
      const dsId = source.dataSourceId;
      try {
        const dsDetail = await bedrockClient.send(new GetDataSourceCommand({
          knowledgeBaseId: kbId, dataSourceId: dsId,
        }));
        const dsConfig = dsDetail.dataSource;
        await bedrockClient.send(new UpdateDataSourceCommand({
          knowledgeBaseId: kbId,
          dataSourceId: dsId,
          name: dsConfig.name,
          dataDeletionPolicy: 'RETAIN',
          dataSourceConfiguration: dsConfig.dataSourceConfiguration,
        }));
        console.log(`Set dataDeletionPolicy=RETAIN on data source ${dsId}`);
      } catch (e) { console.log(`Update DS policy: ${e.message}`); }

      await bedrockClient.send(new DeleteDataSourceCommand({
        knowledgeBaseId: kbId, dataSourceId: dsId,
      }));
      console.log(`Data source ${dsId} deleted`);
    }
    await bedrockClient.send(new DeleteKnowledgeBaseCommand({ knowledgeBaseId: kbId }));
    console.log('KB deleted');
  } catch (e) { console.log(`KB cleanup: ${e.message}`); }

  // Delete vector index + bucket (we handle this ourselves since RETAIN was set)
  try {
    await s3v.send(new DeleteIndexCommand({
      vectorBucketName: VECTOR_BUCKET_NAME, indexName: VECTOR_INDEX_NAME,
    }));
    console.log('Vector index deleted');
  } catch (e) { console.log(`Index cleanup: ${e.message}`); }

  try {
    await s3v.send(new DeleteVectorBucketCommand({ vectorBucketName: VECTOR_BUCKET_NAME }));
    console.log('Vector bucket deleted');
  } catch (e) { console.log(`Bucket cleanup: ${e.message}`); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
