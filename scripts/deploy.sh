#!/bin/bash
# =============================================================================
# Guidance for Voice AI Travel Concierge on AWS
# User-Facing Deploy Script
#
# Deploys the full Travel Concierge stack to your AWS account.
# Supports macOS, Linux, and Windows (WSL/Git Bash).
# =============================================================================
set -e

# =============================================================================
# CONFIGURATION -- edit these defaults or pass as environment variables
# =============================================================================
AWS_REGION="${AWS_REGION:-us-east-1}"
COMPANY_NAME="${COMPANY_NAME:-Travel Concierge}"
SUPPORT_PHONE="${SUPPORT_PHONE:-}"   # e.g. +18005551234 -- leave empty to hide call button

# =============================================================================
# PLATFORM DETECTION
# =============================================================================
detect_platform() {
    case "$(uname -s 2>/dev/null || echo Windows)" in
        Darwin*)  PLATFORM="macos" ;;
        Linux*)   PLATFORM="linux" ;;
        MINGW*|MSYS*|CYGWIN*|Windows*) PLATFORM="windows" ;;
        *)        PLATFORM="unknown" ;;
    esac
    echo "Detected platform: $PLATFORM"
}

# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================
check_prerequisites() {
    echo "Checking prerequisites..."

    command -v aws >/dev/null 2>&1 || {
        echo "ERROR: AWS CLI is required."
        echo "Install: https://aws.amazon.com/cli/"
        exit 1
    }

    command -v node >/dev/null 2>&1 || {
        echo "ERROR: Node.js 20+ is required."
        echo "Install: https://nodejs.org/"
        exit 1
    }

    NODE_VERSION=$(node -e "console.log(process.versions.node.split('.')[0])")
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo "ERROR: Node.js 20+ required (found $NODE_VERSION). Please upgrade."
        exit 1
    fi

    command -v python3 >/dev/null 2>&1 || {
        echo "ERROR: Python 3.12+ is required."
        echo "Install: https://www.python.org/downloads/"
        exit 1
    }

    command -v cdk >/dev/null 2>&1 || {
        echo "AWS CDK CLI not found. Installing globally..."
        npm install -g aws-cdk
    }

    command -v docker >/dev/null 2>&1 || {
        echo "WARNING: Docker not found. The AgentCore Runtime build requires Docker."
        echo "Install: https://docs.docker.com/get-docker/"
        echo "Continuing -- Docker is needed for the container build step."
    }

    echo "All prerequisites satisfied."
}

# =============================================================================
# COLLECT REQUIRED INPUTS
# =============================================================================
collect_inputs() {
    echo ""
    echo "=== Deployment Configuration ==="

    if [ -z "$USER_EMAIL" ]; then
        read -p "Enter your email address (for Cognito test user): " USER_EMAIL
    fi

    if [ -z "$USER_NAME" ]; then
        read -p "Enter your full name (for Cognito test user): " USER_NAME
    fi

    if [ -z "$COMPANY_NAME" ] || [ "$COMPANY_NAME" = "Travel Concierge" ]; then
        read -p "Enter airline/company name [Travel Concierge]: " INPUT_COMPANY
        COMPANY_NAME="${INPUT_COMPANY:-Travel Concierge}"
    fi

    if [ -z "$SUPPORT_PHONE" ]; then
        read -p "Enter support phone number for live agent escalation (e.g. +18005551234) [leave blank to hide]: " SUPPORT_PHONE
    fi

    echo ""
    echo "Configuration:"
    echo "  Region:        $AWS_REGION"
    echo "  Email:         $USER_EMAIL"
    echo "  Name:          $USER_NAME"
    echo "  Company:       $COMPANY_NAME"
    echo "  Support Phone: ${SUPPORT_PHONE:-<not set>}"
    echo ""
    read -p "Proceed with deployment? (yes/no): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
}

# =============================================================================
# CDK BOOTSTRAP CHECK
# =============================================================================
check_cdk_bootstrap() {
    echo "Checking CDK bootstrap..."
    CDK_BOOTSTRAP=$(aws cloudformation describe-stacks \
        --region "$AWS_REGION" \
        --query "Stacks[?StackName=='CDKToolkit'].StackName" \
        --output text 2>/dev/null || echo "")
    if [ -z "$CDK_BOOTSTRAP" ] || [ "$CDK_BOOTSTRAP" = "None" ]; then
        echo "Running CDK bootstrap for account $ACCOUNT_ID in $AWS_REGION..."
        cdk bootstrap "aws://$ACCOUNT_ID/$AWS_REGION"
    else
        echo "CDK already bootstrapped."
    fi
}

# =============================================================================
# MAIN DEPLOYMENT
# =============================================================================
detect_platform
check_prerequisites

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo ""
echo "AWS Account: $ACCOUNT_ID"
echo "AWS Region:  $AWS_REGION"
echo ""

collect_inputs
check_cdk_bootstrap

echo ""
echo "=== Step 1/5: Backend Infrastructure (DynamoDB, Lambda, API Gateway, Cognito, Knowledge Base) ==="
cd backend/backend-infrastructure
npm install --silent
cdk deploy --all \
    --require-approval never \
    --concurrency 1 \
    --parameters "TH-CognitoStack:UserEmail=$USER_EMAIL" \
    --parameters "TH-CognitoStack:UserName=$USER_NAME" \
    --parameters "TH-LambdaStack:SenderEmail=$USER_EMAIL" \
    ${COMPANY_NAME:+--parameters "TH-LambdaStack:CompanyName=$COMPANY_NAME"} \
    ${SUPPORT_PHONE:+--parameters "TH-LambdaStack:SupportPhone=$SUPPORT_PHONE"} \
    --outputs-file "../../cdk-outputs/backend-infrastructure.json"
cd ../..
echo "Backend infrastructure deployed."

# Extract API Gateway ID
API_GATEWAY_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-ApiGatewayStack']['ApiGatewayId']||'')")

echo ""
echo "=== Step 2/5: AgentCore Gateway (MCP) ==="
cd backend/agentcore-gateway/cdk
npm install --silent
cdk deploy \
    --require-approval never \
    --context "apiGatewayId=$API_GATEWAY_ID" \
    --outputs-file "../../../cdk-outputs/agentcore-gateway.json"
cd ../../..
echo "AgentCore Gateway deployed."

# Extract Gateway URL
GATEWAY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/agentcore-gateway.json','utf8')); console.log(d['TH-AgentCoreGatewayStack']['GatewayUrl']||'')")

echo ""
echo "=== Step 3/5: AgentCore Runtime (Nova Sonic container) ==="
echo "NOTE: This step builds a Docker container via AWS CodeBuild and may take 10-15 minutes."
cd backend/agentcore-runtime/cdk
npm install --silent
cdk deploy --all \
    --require-approval never \
    --parameters "TH-AgentCoreRuntimeStack:AgentCoreGatewayUrl=$GATEWAY_URL" \
    ${COMPANY_NAME:+--parameters "TH-AgentCoreRuntimeStack:CompanyName=$COMPANY_NAME"} \
    --outputs-file "../../../cdk-outputs/agentcore-runtime.json"
cd ../../..
echo "AgentCore Runtime deployed."

echo ""
echo "=== Step 4/5: Synthetic Data (optional) ==="
read -p "Seed sample flights, passengers, and bookings? (yes/no): " SEED_DATA
if [[ "$SEED_DATA" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    cd backend/synthetic-data
    pip3 install -r requirements.txt --quiet
    python3 populate_data.py \
        ${USER_EMAIL:+--user-email "$USER_EMAIL"} \
        ${USER_NAME:+--user-name "$USER_NAME"}
    cd ../..
    echo "Synthetic data seeded."
fi

echo ""
echo "=== Step 5/5: Frontend (optional) ==="
read -p "Deploy React frontend to AWS Amplify? (yes/no): " DEPLOY_FRONTEND
if [[ "$DEPLOY_FRONTEND" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    cd frontend/cdk
    npm install --silent
    cdk deploy --require-approval never \
        --outputs-file "../../cdk-outputs/frontend.json"
    cd ..
    npm install --silent
    npm run deploy:amplify
    cd ..
    AMPLIFY_URL=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/frontend.json','utf8')); console.log(d['TH-FrontendStack']['AmplifyAppUrl']||'')")
    echo "Frontend deployed: $AMPLIFY_URL"
fi

# =============================================================================
# DEPLOYMENT VALIDATION
# =============================================================================
echo ""
echo "=== Validating Deployment ==="

RUNTIME_ARN=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/agentcore-runtime.json','utf8')); console.log(d['TH-AgentCoreRuntimeStack']['AgentRuntimeArn']||'')" 2>/dev/null || echo "")
USER_POOL_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('cdk-outputs/backend-infrastructure.json','utf8')); console.log(d['TH-CognitoStack']['UserPoolId']||'')" 2>/dev/null || echo "")

if [ -n "$RUNTIME_ARN" ] && [ -n "$USER_POOL_ID" ]; then
    echo "Deployment validated successfully."
    echo "  Runtime ARN:  $RUNTIME_ARN"
    echo "  User Pool ID: $USER_POOL_ID"
else
    echo "WARNING: Could not validate all outputs. Check cdk-outputs/ for details."
fi

# =============================================================================
# CLEANUP INSTRUCTIONS
# =============================================================================
echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Test user credentials:"
echo "  Username: AppUser"
echo "  Password: Check your email ($USER_EMAIL) for the temporary password."
echo "            You will be prompted to change it on first login."
echo ""
echo "To clean up all resources:"
echo "  ./cleanup-all.sh"
echo ""
echo "To view deployment status:"
echo "  ./status.sh"
