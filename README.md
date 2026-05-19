# Guidance for Voice AI Travel Concierge with Amazon Bedrock AgentCore and Nova Sonic

A voice-first airline concierge powered by **Amazon Bedrock AgentCore**, **Amazon Nova Sonic 2** (speech-to-speech), and a **React** web frontend. Customers speak naturally to manage their flights, seats, meals, and travel preferences, with a live agent escalation capability.

## Table of Contents

- [Overview](#overview)
- [Cost](#cost)
- [Prerequisites](#prerequisites)
- [Automated Deployment](#automated-deployment)
- [Manual Deployment](#manual-deployment)
- [Deployment Validation](#deployment-validation)
- [Running the Guidance](#running-the-guidance)
- [Next Steps](#next-steps)
- [Cleanup](#cleanup)
- [Notices](#notices)

---

## Overview

This Guidance demonstrates how to build a production-grade, voice-first AI concierge for the travel and hospitality industry using AWS managed services. Customers interact with the concierge entirely by voice: **Amazon Nova Sonic 2** handles bidirectional speech-to-speech processing, **Amazon Bedrock AgentCore Runtime** hosts the containerized agent, and **Amazon Bedrock AgentCore Gateway** exposes backend airline APIs as Model Context Protocol (MCP) tools that the agent discovers and calls at runtime.

The architecture follows a layered pattern:

```
Customer (voice/text)
    |
React Frontend (WebSocket -- AWS Amplify)
    |
Amazon Bedrock AgentCore Runtime (Nova Sonic 2 agent container)
    |
Amazon Bedrock AgentCore Gateway (MCP -- tool discovery)
    |
Amazon API Gateway --> AWS Lambda --> Amazon DynamoDB
                                  --> Amazon Bedrock Knowledge Base (policy queries)
```

**Key capabilities:**
- Voice-first conversation -- speak naturally; Nova Sonic 2 handles speech-to-speech
- Flight management -- view itinerary, check flight status, seat changes, meal updates, rebooking
- Visual data cards -- passenger cards, seat maps, meal preferences, flight status rendered in the browser
- Policy queries -- baggage fees, cancellation rules via **Amazon Bedrock Knowledge Base** backed by **Amazon S3 Vectors**
- Live agent escalation -- dial a configurable support number directly from the app
- Session continuity -- conversation context preserved across reconnects

![Architecture Diagram](guidance-docs/architecture-diagram.pptx)

---

## Cost

_You are responsible for the cost of the AWS services used while running this Guidance. As of May 2026, the estimated cost for running this Guidance with default settings in the US East (N. Virginia) region is approximately **$150 per month** for light usage (100 voice sessions/day, 5 minutes each)._

_We recommend creating a Budget through **AWS Cost Explorer** to help manage costs. Prices are subject to change. For full details, refer to the pricing page for each AWS service used in this Guidance._

| AWS Service | Dimensions | Estimated Monthly Cost (USD) |
|---|---|---|
| Amazon Bedrock Nova Sonic 2 | 100 sessions/day x 5 min x 30 days = 15,000 min | ~$75.00 |
| Amazon Bedrock AgentCore Runtime | 100 sessions/day x 5 min x 30 days | ~$30.00 |
| Amazon Bedrock AgentCore Gateway | 100 sessions/day x ~20 tool calls/session | ~$6.00 |
| Amazon Bedrock Knowledge Base (S3 Vectors) | 1 KB, ~50 queries/day | ~$5.00 |
| Amazon API Gateway | ~2,000 REST API calls/day x 30 days = 60,000 calls | ~$0.21 |
| AWS Lambda | 60,000 invocations x 256 MB x 1 s avg | ~$0.50 |
| Amazon DynamoDB | 8 tables, on-demand, ~60,000 reads/writes/month | ~$1.50 |
| Amazon Cognito | 1 user pool, <1,000 MAU | ~$0.00 |
| Amazon S3 | 3 buckets, <1 GB storage | ~$0.03 |
| Amazon ECR | 1 repository, ~500 MB image | ~$0.05 |
| AWS CodeBuild | 1 build per deploy, ~10 min | ~$0.05 |
| AWS Amplify | Static hosting, <1 GB | ~$0.01 |
| Amazon SES | ~100 notification emails/month | ~$0.01 |
| Amazon CloudWatch | Logs and metrics for all services | ~$5.00 |
| AWS X-Ray | Tracing for AgentCore Runtime | ~$1.00 |
| **Total** | | **~$124.36** |

---

## Prerequisites

**Operating System:** Amazon Linux 2023, macOS 13+, or Ubuntu 22.04+. Windows users should use WSL2 or Git Bash.

**Required tools:**

| Tool | Version | Install |
|---|---|---|
| AWS CLI | 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| AWS CDK CLI | 2.200+ | `npm install -g aws-cdk` |
| Docker | 24+ | [docs.docker.com](https://docs.docker.com/get-docker/) |

**AWS account requirements:**

- **Amazon Bedrock Nova Sonic 2 model access** -- request access in the Bedrock console under Model Access for `amazon.nova-2-sonic-v1:0` in `us-east-1`
- **Amazon Bedrock Titan Embed Text v2 model access** -- required for the Knowledge Base; enable `amazon.titan-embed-text-v2:0`
- **CDK bootstrap** -- run `cdk bootstrap aws://<ACCOUNT_ID>/us-east-1` once per account/region
- **Sufficient service quotas** -- the deployment creates 8 DynamoDB tables, 14 Lambda functions, 1 ECR repository, 1 CodeBuild project, and 1 Bedrock AgentCore Runtime

**CDK bootstrap (run once per account/region):**

```bash
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1
```

---

## Automated Deployment

Clone the repository and run the deploy script:

```bash
git clone https://github.com/aws-samples/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic.git
cd sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic
./scripts/deploy.sh
```

The script will prompt you for:
- Your email address (used to create the Cognito test user and receive the temporary password)
- Your full name
- Airline/company name (used to brand the agent)
- Support phone number for live agent escalation (optional)

It then deploys all five components in order: backend infrastructure, AgentCore Gateway, AgentCore Runtime (container build via CodeBuild -- allow 10-15 minutes), synthetic data, and the React frontend on AWS Amplify.

For a full list of options, run `./scripts/deploy.sh --help` or see the [Manual Deployment](#manual-deployment) section.

---

## Manual Deployment

Follow these steps to deploy each component individually.

### Step 1: Clone the repository

```bash
git clone https://github.com/aws-samples/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic.git
cd sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic
```

### Step 2: Deploy backend infrastructure

This stack deploys 8 **Amazon DynamoDB** tables, 14 **AWS Lambda** functions, an **Amazon API Gateway** REST API, an **Amazon Cognito** User Pool and Identity Pool, and an **Amazon Bedrock Knowledge Base** backed by **Amazon S3 Vectors**.

```bash
cd backend/backend-infrastructure
npm install
cdk deploy --all \
  --require-approval never \
  --concurrency 1 \
  --parameters TH-CognitoStack:UserEmail=your@email.com \
  --parameters TH-CognitoStack:UserName="Your Name" \
  --parameters TH-LambdaStack:SenderEmail=your@email.com \
  --parameters TH-LambdaStack:CompanyName="SkyWave Airlines" \
  --parameters TH-LambdaStack:SupportPhone="+18005551234" \
  --outputs-file ../../cdk-outputs/backend-infrastructure.json
cd ../..
```

Note the `ApiGatewayId` value from `cdk-outputs/backend-infrastructure.json` -- you will need it in the next step.

### Step 3: Deploy AgentCore Gateway

This stack creates an **Amazon Bedrock AgentCore Gateway** that reads the API Gateway OpenAPI schema and exposes each endpoint as an MCP tool.

```bash
API_GATEWAY_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-ApiGatewayStack']['ApiGatewayId'])")

cd backend/agentcore-gateway/cdk
npm install
cdk deploy \
  --require-approval never \
  --context apiGatewayId="$API_GATEWAY_ID" \
  --outputs-file ../../../cdk-outputs/agentcore-gateway.json
cd ../../..
```

Note the `GatewayUrl` value from `cdk-outputs/agentcore-gateway.json`.

### Step 4: Deploy AgentCore Runtime

This stack builds a Docker container image for the Nova Sonic 2 agent using **AWS CodeBuild** (ARM64), pushes it to **Amazon ECR**, and creates an **Amazon Bedrock AgentCore Runtime**. Allow 10-15 minutes for the container build.

```bash
GATEWAY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/agentcore-gateway.json','utf8')); console.log(d['TH-AgentCoreGatewayStack']['GatewayUrl'])")

cd backend/agentcore-runtime/cdk
npm install
cdk deploy --all \
  --require-approval never \
  --parameters TH-AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL" \
  --parameters TH-AgentCoreRuntimeStack:CompanyName="SkyWave Airlines" \
  --outputs-file ../../../cdk-outputs/agentcore-runtime.json
cd ../../..
```

### Step 5: Seed synthetic data (optional)

```bash
cd backend/synthetic-data
pip3 install -r requirements.txt
python3 populate_data.py --user-email your@email.com --user-name "Your Name"
cd ../..
```

### Step 6: Deploy frontend (optional)

```bash
cd frontend/cdk
npm install
cdk deploy --require-approval never \
  --outputs-file ../../cdk-outputs/frontend.json
cd ..
npm install
npm run deploy:amplify
cd ..
```

### Step 7: Set your password

After deployment, Cognito sends a temporary password to your email. Change it using the AWS CLI:

```bash
CLIENT_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-CognitoStack']['UserPoolClientId'])")

# Initiate auth to get the NEW_PASSWORD_REQUIRED challenge
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters USERNAME=AppUser,PASSWORD="<temp-password-from-email>"
```

Then respond to the challenge with your new password:

```bash
aws cognito-idp respond-to-auth-challenge \
  --client-id "$CLIENT_ID" \
  --challenge-name NEW_PASSWORD_REQUIRED \
  --session "<session-from-above>" \
  --challenge-responses USERNAME=AppUser,NEW_PASSWORD="<your-new-password>"
```

---

## Deployment Validation

After deployment, verify each component:

**1. Check CloudFormation stacks:**

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?contains(StackName,'TH-')].{Name:StackName,Status:StackStatus}" \
  --output table
```

Expected stacks: `TH-DynamoDBStack`, `TH-KnowledgeBaseStack`, `TH-LambdaStack`, `TH-ApiGatewayStack`, `TH-CognitoStack`, `TH-AgentCoreGatewayStack`, `TH-AgentCoreInfraStack`, `TH-AgentCoreRuntimeStack`, `TH-FrontendStack`.

**2. Verify the AgentCore Runtime is active:**

```bash
RUNTIME_ARN=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/agentcore-runtime.json','utf8')); console.log(d['TH-AgentCoreRuntimeStack']['AgentRuntimeArn'])")
aws bedrock-agentcore get-agent-runtime --agent-runtime-id "${RUNTIME_ARN##*/}"
```

Expected: `"status": "ACTIVE"`.

**3. Test the API Gateway:**

```bash
./status.sh
```

---

## Running the Guidance

### Option A: React frontend (recommended)

If you deployed the frontend, open the Amplify URL printed at the end of deployment. Sign in with:
- **Username:** `AppUser`
- **Password:** the password you set in Step 7

Click the microphone button and speak naturally. Example prompts:
- "What flights do I have coming up?"
- "Can you change my seat on the Dallas flight to an aisle seat?"
- "What's the baggage fee for an extra checked bag?"
- "I need to speak to a live agent."

### Option B: Test client (CLI)

```bash
USER_POOL_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-CognitoStack']['UserPoolId'])")
CLIENT_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-CognitoStack']['UserPoolClientId'])")
IDENTITY_POOL_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-CognitoStack']['IdentityPoolId'])")
RUNTIME_ARN=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/agentcore-runtime.json','utf8')); console.log(d['TH-AgentCoreRuntimeStack']['AgentRuntimeArn'])")

cd backend/agentcore-runtime/test-client
python3 client-cognito-sigv4.py \
  --username AppUser \
  --password "<your-password>" \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --identity-pool-id "$IDENTITY_POOL_ID" \
  --runtime-arn "$RUNTIME_ARN" \
  --region us-east-1
```

Then open `http://localhost:8000` in your browser.

---

## Next Steps

- **Add your own policy documents** -- place PDF files in `backend/policy-documents/` and redeploy `TH-KnowledgeBaseStack` to update the Knowledge Base
- **Customize the agent persona** -- edit the system prompt in `backend/agentcore-runtime/agent/travel_agent.py`
- **Add new API tools** -- add Lambda functions and API Gateway endpoints in `backend/backend-infrastructure/lib/`, then redeploy the Gateway stack to expose them as MCP tools
- **Enable multi-language support** -- the agent already switches languages when the customer speaks in a different language; extend the system prompt for additional language-specific behavior
- **Production hardening** -- see the Known Limitations section in `KNOWN-LIMITATIONS.md` for guidance on production readiness, including VPC isolation, encryption at rest with AWS KMS, and enabling AWS WAF on the API Gateway

---

## Cleanup

To delete all deployed resources:

```bash
./cleanup-all.sh
```

This script deletes all CloudFormation stacks in reverse dependency order. Note the following manual cleanup steps:

1. **Amazon S3 buckets** -- the script empties and deletes all buckets created by this Guidance
2. **Amazon ECR repository** -- the script deletes the container image repository
3. **Amazon Bedrock Knowledge Base** -- deleted via the custom resource Lambda
4. **Amazon SES email identity** -- if you verified an email identity, delete it manually:
   ```bash
   aws sesv2 delete-email-identity --email-identity your@email.com
   ```
5. **CDK bootstrap stack** -- if you bootstrapped CDK solely for this Guidance, delete it:
   ```bash
   aws cloudformation delete-stack --stack-name CDKToolkit
   ```

---

## Notices

*Customers are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.*
