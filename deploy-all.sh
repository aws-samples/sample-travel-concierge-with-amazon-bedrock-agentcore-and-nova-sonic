#!/bin/bash

################################################################################
# Idempotent Deploy - Travel Concierge System
# 
# Idempotent deployment that can be run multiple times safely
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Source state manager
source ./deployment-state.sh

OUTPUTS_DIR="cdk-outputs"
USER_EMAIL=""
USER_NAME=""
COMPANY_NAME=""
SUPPORT_PHONE=""
MODE="update"  # update (idempotent) or fresh (clean redeploy)
SKIP_PREFLIGHT=false
SKIP_SYNTHETIC_DATA=false
SKIP_FRONTEND=false
WITH_SYNTHETIC_DATA=false
WITH_FRONTEND=false
FORCE_DEPLOY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --user-email) USER_EMAIL="$2"; shift 2 ;;
    --user-name) USER_NAME="$2"; shift 2 ;;
    --company-name) COMPANY_NAME="$2"; shift 2 ;;
    --support-phone) SUPPORT_PHONE="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
    --skip-synthetic-data) SKIP_SYNTHETIC_DATA=true; shift ;;
    --with-synthetic-data) WITH_SYNTHETIC_DATA=true; shift ;;
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --with-frontend) WITH_FRONTEND=true; shift ;;
    --force-deploy) FORCE_DEPLOY=true; shift ;;
    --help)
      echo "Usage: ./deploy-all.sh [OPTIONS]"
      echo ""
      echo "Required Options:"
      echo "  --user-email EMAIL           Email for Cognito user (required for first deployment)"
      echo "  --user-name NAME             Full name for Cognito user (required for first deployment)"
      echo "  --company-name NAME          Company/brand name for the travel company (e.g. \"SkyWave Airlines\")"
      echo "  --support-phone PHONE        Support phone number for live agent escalation (e.g. \"+18005551234\")"
      echo ""
      echo "Deployment Options:"
      echo "  --mode MODE                  Deployment mode: update (default) or fresh"
      echo "  --skip-preflight             Skip preflight checks"
      echo "  --force-deploy               Force CDK deploy on all projects (bypass state checks)"
      echo ""
      echo "Optional Components:"
      echo "  --with-synthetic-data        Seed database with sample data (non-interactive)"
      echo "  --skip-synthetic-data        Skip synthetic data seeding (non-interactive)"
      echo "  --with-frontend              Deploy frontend application (non-interactive)"
      echo "  --skip-frontend              Skip frontend deployment (non-interactive)"
      echo ""
      echo "Other:"
      echo "  --help                       Show this help"
      echo ""
      echo "Deployment Modes:"
      echo "  update  - Update existing deployment (idempotent, default)"
      echo "  fresh   - Delete and redeploy everything from scratch"
      echo ""
      echo "Examples:"
      echo "  # Deploy everything (will prompt for synthetic data and frontend)"
      echo "  ./deploy-all.sh --user-email you@example.com --user-name \"Your Name\""
      echo ""
      echo "  # Deploy with synthetic data, skip frontend"
      echo "  ./deploy-all.sh --user-email you@example.com --user-name \"Your Name\" \\"
      echo "    --with-synthetic-data --skip-frontend"
      echo ""
      echo "  # Fresh deployment (clean redeploy)"
      echo "  ./deploy-all.sh --user-email you@example.com --user-name \"Your Name\" \\"
      echo "    --mode fresh"
      exit 0
      ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

print_section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Helper: extract JSON value from file - json_val <file> <stack> <key> [default]
json_val() {
  local file=$1 stack=$2 key=$3 default=${4:-}
  node -e "const d=JSON.parse(require('fs').readFileSync('$file','utf8')); console.log((d['$stack']||{})['$key']||'$default')"
}

# Helper: extract JSON value from stdin
json_stdin() {
  local key=$1 default=${2:-}
  node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(b)['$key']||'$default')}catch(e){console.log('$default')}})"
}

# Run preflight checks
if [ "$SKIP_PREFLIGHT" = false ]; then
  print_section "Running Preflight Checks"
  ./preflight-check.sh || exit 1
fi

# Initialize state
init_state
mkdir -p "$OUTPUTS_DIR"

# Handle fresh mode
if [ "$MODE" = "fresh" ]; then
  print_warning "Fresh mode: cleaning up existing deployment"
  ./cleanup-all.sh --force --ignore-missing-resources || true
  rm -f "$STATE_FILE"
  init_state
fi

print_section "Idempotent Deployment - Mode: $MODE"

################################################################################
# Backend Infrastructure
################################################################################

print_section "Backend Infrastructure"

BACKEND_DEPLOYED=$(is_deployed "backend-infrastructure")

if [ "$FORCE_DEPLOY" = true ]; then
  print_info "Force deploy: redeploying backend infrastructure..."
  BACKEND_DEPLOYED="false"
elif [ "$BACKEND_DEPLOYED" = "true" ]; then
  print_info "Backend infrastructure already deployed, checking stacks..."
  
  # Check if stacks exist
  STACKS_EXIST=true
  for stack in TH-DynamoDBStack TH-KnowledgeBaseStack TH-LambdaStack TH-ApiGatewayStack TH-CognitoStack; do
    if [ -z "$(stack_exists $stack)" ]; then
      print_warning "Stack $stack not found"
      STACKS_EXIST=false
    fi
  done
  
  if [ "$STACKS_EXIST" = true ]; then
    print_success "All backend stacks exist, updating..."
  else
    print_warning "Some stacks missing, redeploying..."
    BACKEND_DEPLOYED="false"
  fi
fi

if [ "$BACKEND_DEPLOYED" = "false" ]; then
  cd backend/backend-infrastructure
  
  if [ -z "$USER_EMAIL" ] || [ -z "$USER_NAME" ]; then
    print_error "First deployment requires --user-email and --user-name"
    exit 1
  fi
  
  print_info "Installing dependencies..."
  npm install > /dev/null 2>&1
  
  print_info "Deploying backend infrastructure (sequential to avoid API Gateway rate limits)..."
  
  DEPLOY_ATTEMPTS=0
  DEPLOY_SUCCESS=false
  
  while [ $DEPLOY_ATTEMPTS -lt 3 ] && [ "$DEPLOY_SUCCESS" = false ]; do
    DEPLOY_ATTEMPTS=$((DEPLOY_ATTEMPTS + 1))
    
    if [ $DEPLOY_ATTEMPTS -gt 1 ]; then
      print_warning "Retry attempt $DEPLOY_ATTEMPTS/3 — waiting 30s for API Gateway rate limits to clear..."
      sleep 30
      
      # Clean up any ROLLBACK_COMPLETE stacks before retrying
      for stack in TH-ApiGatewayStack TH-CognitoStack TH-LambdaStack TH-KnowledgeBaseStack TH-DynamoDBStack; do
        STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$stack" --region us-east-1 \
          --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "")
        if [ "$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
          print_info "Cleaning up failed stack $stack..."
          aws cloudformation delete-stack --stack-name "$stack" --region us-east-1
          aws cloudformation wait stack-delete-complete --stack-name "$stack" --region us-east-1 2>/dev/null || true
        fi
      done
    fi
    
    cdk deploy --all \
      --require-approval never \
      --concurrency 3 \
      --parameters TH-CognitoStack:UserEmail="$USER_EMAIL" \
      --parameters TH-CognitoStack:UserName="$USER_NAME" \
      --parameters TH-LambdaStack:SenderEmail="$USER_EMAIL" \
      ${COMPANY_NAME:+--parameters TH-LambdaStack:CompanyName="$COMPANY_NAME"} \
      ${SUPPORT_PHONE:+--parameters TH-LambdaStack:SupportPhone="$SUPPORT_PHONE"} \
      --outputs-file "../../$OUTPUTS_DIR/backend-infrastructure.json" && DEPLOY_SUCCESS=true
  done
  
  if [ "$DEPLOY_SUCCESS" = false ]; then
    print_error "Backend infrastructure deployment failed after 3 attempts"
    exit 1
  fi
  
  update_state "backend-infrastructure" true '{"stacks": ["TH-DynamoDBStack", "TH-KnowledgeBaseStack", "TH-LambdaStack", "TH-ApiGatewayStack", "TH-CognitoStack"]}'
  print_success "Backend infrastructure deployed"
  
  # Create SES email identity for notifications (only if not already verified)
  if [ -n "$USER_EMAIL" ]; then
    SES_STATUS=$(aws sesv2 get-email-identity \
      --email-identity "$USER_EMAIL" \
      --region us-east-1 \
      --query "VerifiedForSendingStatus" \
      --output text 2>/dev/null || echo "NOT_FOUND")

    if [ "$SES_STATUS" = "True" ]; then
      print_info "SES email identity already verified for $USER_EMAIL"
    elif [ "$SES_STATUS" = "False" ]; then
      print_info "SES email identity exists but not yet verified — check your inbox for the verification link"
    else
      print_info "Creating SES email identity for $USER_EMAIL..."
      aws sesv2 create-email-identity \
        --email-identity "$USER_EMAIL" \
        --region us-east-1 > /dev/null 2>&1 || true
      print_success "SES email identity created — check inbox for verification link"
    fi
  fi

  cd ../..
else
  print_success "Backend infrastructure up to date"
fi

################################################################################
# Knowledge Base Ingestion
################################################################################

print_section "Knowledge Base — Syncing Policy Documents"

KB_ID=$(aws cloudformation list-exports --region us-east-1 \
  --query "Exports[?Name=='TH-KnowledgeBaseId'].Value" --output text 2>/dev/null || echo "")

if [ -n "$KB_ID" ] && [ "$KB_ID" != "None" ]; then
  DS_ID=$(aws bedrock-agent list-data-sources --knowledge-base-id "$KB_ID" \
    --region us-east-1 --query "dataSourceSummaries[0].dataSourceId" --output text 2>/dev/null || echo "")

  if [ -n "$DS_ID" ] && [ "$DS_ID" != "None" ]; then
    # Check if already indexed (idempotent — skip if docs already indexed)
    ALREADY_INDEXED=$(aws bedrock-agent list-ingestion-jobs \
      --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
      --region us-east-1 \
      --query "ingestionJobSummaries[?status=='COMPLETE'].statistics.numberOfNewDocumentsIndexed" \
      --output text 2>/dev/null | awk '{s+=$1} END{print s}')

    if [ "${ALREADY_INDEXED:-0}" -gt 0 ]; then
      print_success "Knowledge Base already indexed ($ALREADY_INDEXED documents) — skipping sync"
    else
      print_info "Starting Knowledge Base ingestion (KB: $KB_ID)..."
      JOB_ID=$(aws bedrock-agent start-ingestion-job \
        --knowledge-base-id "$KB_ID" \
        --data-source-id "$DS_ID" \
        --region us-east-1 \
        --query "ingestionJob.ingestionJobId" --output text 2>/dev/null || echo "")

      if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "None" ]; then
        print_info "Ingestion job started: $JOB_ID"
        print_info "Waiting for ingestion to complete (this takes ~2-5 minutes)..."
        for i in $(seq 1 30); do
          JOB_STATUS=$(aws bedrock-agent get-ingestion-job \
            --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
            --ingestion-job-id "$JOB_ID" --region us-east-1 \
            --query "ingestionJob.{status:status,indexed:statistics.numberOfNewDocumentsIndexed}" \
            --output text 2>/dev/null)
          STATUS=$(echo "$JOB_STATUS" | awk '{print $2}')
          INDEXED=$(echo "$JOB_STATUS" | awk '{print $1}')
          if [ "$STATUS" = "COMPLETE" ]; then
            print_success "Knowledge Base sync complete — $INDEXED documents indexed"
            break
          elif [ "$STATUS" = "FAILED" ]; then
            print_error "Knowledge Base ingestion failed"
            break
          fi
          printf "."
          sleep 10
        done
        echo ""
      else
        print_warning "Could not start ingestion job (non-fatal)"
      fi
    fi
  else
    print_warning "Data source not found — skipping KB sync"
  fi
else
  print_warning "Knowledge Base ID not found — skipping KB sync"
fi

################################################################################
# AgentCore Gateway (CDK)
################################################################################

print_section "AgentCore Gateway (CDK)"

GATEWAY_DEPLOYED=$(is_deployed "agentcore-gateway")

if [ "$FORCE_DEPLOY" = true ]; then
  print_info "Force deploy: redeploying gateway..."
  GATEWAY_DEPLOYED="false"
elif [ "$GATEWAY_DEPLOYED" = "true" ]; then
  print_info "Gateway already deployed, checking stack..."
  
  # Check if stack exists
  if [ -n "$(stack_exists TH-AgentCoreGatewayStack)" ]; then
    print_success "Gateway stack exists, updating..."
  else
    print_warning "Gateway stack not found, redeploying..."
    GATEWAY_DEPLOYED="false"
  fi
fi

if [ "$GATEWAY_DEPLOYED" = "false" ]; then
  API_GATEWAY_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-ApiGatewayStack" "ApiGatewayId")
  
  if [ -z "$API_GATEWAY_ID" ]; then
    print_error "Backend API Gateway ID not found. Deploy backend infrastructure first."
    exit 1
  fi

  KB_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-KnowledgeBaseStack" "KnowledgeBaseId")

  if [ -z "$KB_ID" ]; then
    print_error "Bedrock Knowledge Base ID not found. Deploy backend infrastructure first."
    exit 1
  fi
  
  cd backend/agentcore-gateway/cdk
  
  print_info "Installing CDK dependencies..."
  npm install > /dev/null 2>&1
  
  print_info "Deploying AgentCore Gateway via CDK..."
  cdk deploy \
    --require-approval never \
    --context apiGatewayId="$API_GATEWAY_ID" \
    --context knowledgeBaseId="$KB_ID" \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-gateway.json"
  
  # Extract Gateway ID from outputs
  NEW_GATEWAY_ID=$(json_val "../../../$OUTPUTS_DIR/agentcore-gateway.json" "TH-AgentCoreGatewayStack" "GatewayId")
  GATEWAY_ROLE_ARN=$(json_val "../../../$OUTPUTS_DIR/agentcore-gateway.json" "TH-AgentCoreGatewayStack" "GatewayRoleArn")
  
  if [ -n "$NEW_GATEWAY_ID" ]; then
    update_state "agentcore-gateway" true "{\"gateway_id\": \"$NEW_GATEWAY_ID\", \"stack\": \"TH-AgentCoreGatewayStack\"}"
    print_success "AgentCore Gateway deployed (ID: $NEW_GATEWAY_ID)"
  else
    print_warning "Gateway deployed but ID not found in outputs"
    update_state "agentcore-gateway" true "{\"stack\": \"TH-AgentCoreGatewayStack\"}"
  fi

  # Add Managed Knowledge Base connector target via AWS CLI
  # (The @aws-sdk/client-bedrock-agentcore-control SDK does not yet support the
  #  connector target type, so we use the CLI which uses the latest service model)
  if [ -n "$NEW_GATEWAY_ID" ] && [ -n "$KB_ID" ]; then
    print_info "Adding Managed KB connector target to Gateway..."

    # Add bedrock:GetKnowledgeBase, bedrock:Retrieve, bedrock:AgenticRetrieveStream to the gateway role
    REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    KB_ARN="arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:knowledge-base/${KB_ID}"

    if [ -n "$GATEWAY_ROLE_ARN" ]; then
      ROLE_NAME=$(echo "$GATEWAY_ROLE_ARN" | sed 's|.*/||')
      aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "KBConnectorPolicy" \
        --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"bedrock:GetKnowledgeBase\",\"bedrock:Retrieve\"],\"Resource\":\"${KB_ARN}\"},{\"Effect\":\"Allow\",\"Action\":\"bedrock:AgenticRetrieveStream\",\"Resource\":\"*\"}]}" \
        --region us-east-1 2>/dev/null && print_info "KB permissions added to gateway role"
    fi

    # Check if KB target already exists
    EXISTING_KB_TARGET=$(aws bedrock-agentcore-control list-gateway-targets \
      --gateway-identifier "$NEW_GATEWAY_ID" \
      --region us-east-1 \
      --query "items[?name=='th-policy-kb'].targetId" \
      --output text 2>/dev/null)

    if [ -z "$EXISTING_KB_TARGET" ] || [ "$EXISTING_KB_TARGET" = "None" ]; then
      aws bedrock-agentcore-control create-gateway-target \
        --gateway-identifier "$NEW_GATEWAY_ID" \
        --name "th-policy-kb" \
        --description "SkyWave Airlines policy documents via Bedrock Managed Knowledge Base" \
        --target-configuration "{\"mcp\":{\"connector\":{\"source\":{\"connectorId\":\"bedrock-knowledge-bases\"},\"configurations\":[{\"name\":\"AgenticRetrieveStream\",\"parameterValues\":{\"retrievers\":[{\"description\":\"SkyWave Airlines policy documents\",\"configuration\":{\"knowledgeBase\":{\"knowledgeBaseId\":\"${KB_ID}\"}}}],\"agenticRetrieveConfiguration\":{\"foundationModelType\":\"MANAGED\",\"rerankingModelType\":\"MANAGED\"}}},{\"name\":\"Retrieve\",\"parameterValues\":{\"knowledgeBaseId\":\"${KB_ID}\"}}]}}}" \
        --credential-provider-configurations "[{\"credentialProviderType\":\"GATEWAY_IAM_ROLE\"}]" \
        --region us-east-1 > /dev/null 2>&1 \
        && print_success "Managed KB connector target created" \
        || print_warning "KB connector target creation failed (non-fatal — policy queries may not work)"
    else
      print_info "KB connector target already exists: $EXISTING_KB_TARGET"
    fi
  fi

  cd ../../..
else
  print_success "AgentCore Gateway up to date"
fi

################################################################################
# AgentCore Runtime
################################################################################

print_section "AgentCore Runtime"

RUNTIME_DEPLOYED=$(is_deployed "agentcore-runtime")

if [ "$FORCE_DEPLOY" = true ]; then
  print_info "Force deploy: redeploying runtime..."
  RUNTIME_DEPLOYED="false"
elif [ "$RUNTIME_DEPLOYED" = "true" ]; then
  print_info "Runtime already deployed, checking stacks..."
  
  STACKS_EXIST=true
  for stack in TH-AgentCoreInfraStack TH-AgentCoreRuntimeStack; do
    if [ -z "$(stack_exists $stack)" ]; then
      print_warning "Stack $stack not found"
      STACKS_EXIST=false
    fi
  done
  
  if [ "$STACKS_EXIST" = true ]; then
    print_success "Runtime stacks exist, updating..."
  else
    print_warning "Some stacks missing, redeploying..."
    RUNTIME_DEPLOYED="false"
  fi
fi

if [ "$RUNTIME_DEPLOYED" = "false" ]; then
  GATEWAY_URL=$(json_val "$OUTPUTS_DIR/agentcore-gateway.json" "TH-AgentCoreGatewayStack" "GatewayUrl")
  
  if [ -z "$GATEWAY_URL" ]; then
    print_error "Gateway URL not found. Deploy gateway first."
    exit 1
  fi
  
  cd backend/agentcore-runtime/cdk
  
  print_info "Installing dependencies..."
  npm install > /dev/null 2>&1
  
  print_info "Deploying runtime stacks..."
  cdk deploy --all \
    --require-approval never \
    --parameters TH-AgentCoreRuntimeStack:AgentCoreGatewayUrl="$GATEWAY_URL" \
    ${COMPANY_NAME:+--parameters TH-AgentCoreRuntimeStack:CompanyName="$COMPANY_NAME"} \
    --outputs-file "../../../$OUTPUTS_DIR/agentcore-runtime.json"
  
  update_state "agentcore-runtime" true '{"stacks": ["TH-AgentCoreInfraStack", "TH-AgentCoreRuntimeStack"]}'
  print_success "AgentCore Runtime deployed"
  
  cd ../../..
else
  print_success "AgentCore Runtime up to date"
fi

################################################################################
# Synthetic Data (Optional)
################################################################################

# Determine if we should deploy synthetic data
SHOULD_DEPLOY_SYNTHETIC=false

if [ "$WITH_SYNTHETIC_DATA" = true ]; then
  SHOULD_DEPLOY_SYNTHETIC=true
elif [ "$SKIP_SYNTHETIC_DATA" = false ]; then
  # Ask user interactively
  print_section "Synthetic Data (Optional)"
  echo ""
  print_info "Would you like to populate the database with sample data?"
  print_info "This includes sample customers, flights, bookings, and loyalty data."
  echo ""
  read -p "Seed synthetic data? (yes/no): " SEED_DATA
  
  if [[ "$SEED_DATA" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    SHOULD_DEPLOY_SYNTHETIC=true
  fi
fi

if [ "$SHOULD_DEPLOY_SYNTHETIC" = true ]; then
  print_section "Seeding Synthetic Data"
  
  # Check if already populated
  DATA_POPULATED=$(is_deployed "synthetic-data")
  
  if [ "$DATA_POPULATED" = "true" ]; then
    print_warning "Synthetic data already populated"
    read -p "Do you want to repopulate (will clear existing data)? (yes/no): " REPOPULATE
    if [[ ! "$REPOPULATE" =~ ^[Yy]([Ee][Ss])?$ ]]; then
      print_info "Skipping synthetic data"
    else
      cd backend/synthetic-data
      
      print_info "Installing dependencies..."
      pip3 install -r requirements.txt --break-system-packages > /dev/null 2>&1
      
      print_info "Clearing existing synthetic data..."
      python3 cleanup_data.py --force
      
      print_info "Populating database with new synthetic data..."
      python3 populate_data.py ${USER_EMAIL:+--user-email "$USER_EMAIL"} ${USER_NAME:+--user-name "$USER_NAME"}
      
      update_state "synthetic-data" true '{"customer_count": 1, "flight_count": 10, "seat_maps": 5}'
      print_success "Synthetic data repopulated"
      
      cd ../..
    fi
  else
    cd backend/synthetic-data
    
    print_info "Installing dependencies..."
    pip3 install -r requirements.txt --break-system-packages > /dev/null 2>&1
    
    print_info "Populating database with synthetic data..."
    python3 populate_data.py ${USER_EMAIL:+--user-email "$USER_EMAIL"} ${USER_NAME:+--user-name "$USER_NAME"}
    
    update_state "synthetic-data" true '{"customer_count": 1, "flight_count": 10, "seat_maps": 5}'
    print_success "Synthetic data populated"
    
    cd ../..
  fi
fi

################################################################################
# Frontend (Optional)
################################################################################

# Determine if we should deploy frontend
SHOULD_DEPLOY_FRONTEND=false

if [ "$WITH_FRONTEND" = true ]; then
  SHOULD_DEPLOY_FRONTEND=true
elif [ "$SKIP_FRONTEND" = false ]; then
  # Check if frontend directory exists
  if [ -d "frontend" ]; then
    print_section "Frontend (Optional)"
    echo ""
    print_info "Would you like to deploy the frontend application?"
    print_info "This requires AWS Amplify to be configured."
    echo ""
    read -p "Deploy frontend? (yes/no): " DEPLOY_FRONTEND
    
    if [[ "$DEPLOY_FRONTEND" =~ ^[Yy]([Ee][Ss])?$ ]]; then
      SHOULD_DEPLOY_FRONTEND=true
    fi
  fi
fi

if [ "$SHOULD_DEPLOY_FRONTEND" = true ]; then
  if [ ! -d "frontend" ]; then
    print_warning "Frontend directory not found, skipping..."
  else
    print_section "Deploying Frontend to AWS Amplify"
    
    # Step 1: Deploy CDK stack (creates Amplify App)
    cd frontend/cdk
    
    print_info "Installing CDK dependencies..."
    npm install > /dev/null 2>&1
    
    print_info "Creating Amplify App via CDK..."
    cdk deploy --require-approval never \
      --outputs-file "../../$OUTPUTS_DIR/frontend.json"
    
    cd ..
    
    # Step 2: Deploy frontend code to Amplify
    print_info "Installing frontend dependencies..."
    npm install > /dev/null 2>&1
    
    print_info "Deploying frontend code to Amplify..."
    npm run deploy:amplify
    
    AMPLIFY_URL=$(json_val "../$OUTPUTS_DIR/frontend.json" "TH-FrontendStack" "AmplifyAppUrl")
    
    update_state "frontend" true "{\"url\": \"$AMPLIFY_URL\"}"
    print_success "Frontend deployed to Amplify"
    print_info "Frontend URL: $AMPLIFY_URL"
    
    cd ..
  fi
fi

################################################################################
# Password Setup for Test User (last interactive step)
################################################################################

FINAL_PASSWORD="<your-password>"

# Only prompt for password change if not already done and backend outputs exist
PASSWORD_ALREADY_CHANGED=$(get_state_data "backend-infrastructure" "password_changed")

if [ "$PASSWORD_ALREADY_CHANGED" = "true" ]; then
  print_section "Password Setup"
  print_success "Password was already changed in a previous run"
  FINAL_PASSWORD="<your-password>"
elif [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
  print_section "Password Setup for Test User"

  CLIENT_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "UserPoolClientId")
  REGION=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "Region" "us-east-1")
  APP_USER_EMAIL=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "AppUserEmail")
  
  DISPLAY_EMAIL="${APP_USER_EMAIL:-${USER_EMAIL:-your email}}"

  echo ""
  print_info "All infrastructure is deployed. One last step:"
  print_info "The test user 'AppUser' was created with a temporary password sent to: $DISPLAY_EMAIL"
  print_info "This temporary password must be changed before you can use the system."
  echo ""

  if read -t 60 -p "Would you like to change the password now? (yes/no) [timeout in 60s → skip]: " CHANGE_PASSWORD_NOW; then
    echo ""
  else
    echo ""
    print_warning "No response — skipping password change."
    CHANGE_PASSWORD_NOW="no"
  fi

  if [[ "$CHANGE_PASSWORD_NOW" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo ""
    print_info "Changing password for AppUser..."
    echo ""
    
    set +e
    
    PASSWORD_CHANGED=false
    for attempt in 1 2 3; do
      if [ $attempt -gt 1 ]; then
        echo ""
        print_warning "Attempt $attempt of 3"
      fi
      
      read -sp "Enter the temporary password from email: " TEMP_PASSWORD
      echo ""
      read -sp "Enter new permanent password: " NEW_PASSWORD
      echo ""
      read -sp "Confirm new password: " NEW_PASSWORD_CONFIRM
      echo ""
      
      if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
        print_error "Passwords do not match."
        if [ $attempt -lt 3 ]; then
          read -p "Try again? (yes/no): " retry
          if [[ ! "$retry" =~ ^[Yy]([Ee][Ss])?$ ]]; then break; fi
        fi
        continue
      fi
      
      print_info "Changing password..."
      
      AUTH_RESPONSE=$(timeout 10 aws cognito-idp initiate-auth \
        --auth-flow USER_PASSWORD_AUTH \
        --client-id "$CLIENT_ID" \
        --auth-parameters USERNAME=AppUser,PASSWORD="$TEMP_PASSWORD" \
        --region "$REGION" 2>&1)
      
      AUTH_EXIT_CODE=$?
      
      if [ $AUTH_EXIT_CODE -eq 124 ]; then
        print_error "Authentication timed out. Check your network connection."
        if [ $attempt -lt 3 ]; then
          read -p "Try again? (yes/no): " retry
          if [[ ! "$retry" =~ ^[Yy]([Ee][Ss])?$ ]]; then break; fi
        fi
        continue
      fi
      
      if echo "$AUTH_RESPONSE" | grep -q "NotAuthorizedException"; then
        print_error "Incorrect temporary password."
        if [ $attempt -lt 3 ]; then
          read -p "Try again? (yes/no): " retry
          if [[ ! "$retry" =~ ^[Yy]([Ee][Ss])?$ ]]; then break; fi
        fi
        continue
      fi
      
      if echo "$AUTH_RESPONSE" | grep -q "ChallengeName"; then
        SESSION=$(echo "$AUTH_RESPONSE" | json_stdin "Session" 2>/dev/null)
        
        if [ -z "$SESSION" ]; then
          print_error "Failed to extract session token."
          break
        fi
        
        CHALLENGE_RESPONSE=$(timeout 10 aws cognito-idp respond-to-auth-challenge \
          --client-id "$CLIENT_ID" \
          --challenge-name NEW_PASSWORD_REQUIRED \
          --session "$SESSION" \
          --challenge-responses USERNAME=AppUser,NEW_PASSWORD="$NEW_PASSWORD" \
          --region "$REGION" 2>&1)
        
        CHALLENGE_EXIT_CODE=$?
        
        if [ $CHALLENGE_EXIT_CODE -eq 124 ]; then
          print_error "Password change timed out."
          break
        fi
        
        if [ $CHALLENGE_EXIT_CODE -eq 0 ]; then
          print_success "Password changed successfully!"
          FINAL_PASSWORD="$NEW_PASSWORD"
          PASSWORD_CHANGED=true
          update_state "backend-infrastructure" true '{"password_changed": true}'
          break
        else
          print_error "Failed to change password: $(echo "$CHALLENGE_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
          if [ $attempt -lt 3 ]; then
            read -p "Try again? (yes/no): " retry
            if [[ ! "$retry" =~ ^[Yy]([Ee][Ss])?$ ]]; then break; fi
          fi
        fi
      else
        if echo "$AUTH_RESPONSE" | grep -q "AuthenticationResult"; then
          print_success "Password already changed — authentication successful!"
          FINAL_PASSWORD="$TEMP_PASSWORD"
          PASSWORD_CHANGED=true
          update_state "backend-infrastructure" true '{"password_changed": true}'
          break
        fi
        print_error "Unexpected authentication response."
        echo "$AUTH_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4
        break
      fi
    done
    
    set -e
    
    if [ "$PASSWORD_CHANGED" = false ]; then
      print_warning "Password not changed. You'll need to change it on first login."
      FINAL_PASSWORD="<temporary-password-from-email>"
    fi
  else
    print_info "Skipping password change. You will need to change it on first login."
    FINAL_PASSWORD="<temporary-password-from-email>"
  fi
  echo ""
fi

################################################################################
# Test Commands - Ready to Copy and Paste
################################################################################

print_section "Ready-to-Use Test Commands"

# Extract values from deployment outputs
if [ -f "$OUTPUTS_DIR/backend-infrastructure.json" ]; then
  USER_POOL_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "UserPoolId")
  
  CLIENT_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "UserPoolClientId")
  
  IDENTITY_POOL_ID=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "IdentityPoolId")
  
  REGION=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-CognitoStack" "Region" "us-east-1")
  
  API_GATEWAY_URL=$(json_val "$OUTPUTS_DIR/backend-infrastructure.json" "TH-ApiGatewayStack" "ApiGatewayUrl")
fi

# Extract Runtime ARN
if [ -f "$OUTPUTS_DIR/agentcore-runtime.json" ]; then
  RUNTIME_ARN=$(json_val "$OUTPUTS_DIR/agentcore-runtime.json" "TH-AgentCoreRuntimeStack" "AgentRuntimeArn")
fi

# Extract Gateway URL (CDK format)
if [ -f "$OUTPUTS_DIR/agentcore-gateway.json" ]; then
  GATEWAY_URL=$(json_val "$OUTPUTS_DIR/agentcore-gateway.json" "TH-AgentCoreGatewayStack" "GatewayUrl")
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  1. AgentCore Runtime WebSocket Test (Interactive UI)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ] && [ -n "$IDENTITY_POOL_ID" ] && [ -n "$RUNTIME_ARN" ] && [ -n "$REGION" ]; then
  echo -e "${BLUE}cd backend/agentcore-runtime/test-client && python3 client-cognito-sigv4.py \\
  --username AppUser \\
  --password '$FINAL_PASSWORD' \\
  --user-pool-id $USER_POOL_ID \\
  --client-id $CLIENT_ID \\
  --identity-pool-id $IDENTITY_POOL_ID \\
  --runtime-arn $RUNTIME_ARN \\
  --region $REGION${NC}"
  echo ""
  print_info "Then open: http://localhost:8000"
  
  if [ "$FINAL_PASSWORD" == "<temporary-password-from-email>" ]; then
    print_warning "Note: You'll be prompted to change the temporary password on first login"
  fi
else
  print_warning "Missing values for Runtime test. Check outputs in $OUTPUTS_DIR/"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  2. AgentCore Gateway Test (MCP Tools)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$GATEWAY_URL" ]; then
  echo -e "${BLUE}cd backend/agentcore-gateway/test-client && python3 test_gateway.py \\
  --gateway-url $GATEWAY_URL \\
  --list-tools${NC}"
else
  print_warning "Gateway URL not found. Deploy gateway first."
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  3. API Gateway Test (All Endpoints)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$API_GATEWAY_URL" ] && [ -n "$USER_POOL_ID" ] && [ -n "$CLIENT_ID" ] && [ -n "$IDENTITY_POOL_ID" ]; then
  echo -e "${BLUE}cd backend/backend-infrastructure && ./test-api.sh \\
  --username AppUser \\
  --password '$FINAL_PASSWORD' \\
  --client-id $CLIENT_ID \\
  --identity-pool-id $IDENTITY_POOL_ID \\
  --user-pool-id $USER_POOL_ID \\
  --region $REGION \\
  --api-url $API_GATEWAY_URL${NC}"
  
  if [ "$FINAL_PASSWORD" == "<temporary-password-from-email>" ]; then
    echo ""
    print_warning "Note: You'll be prompted to change the password on first run"
  fi
else
  print_warning "API Gateway details not found. Deploy backend first."
fi

################################################################################
# Complete
################################################################################

echo ""
print_section "Deployment Complete!"
print_success "All components deployed successfully"
echo ""

# Show Amplify URL prominently if frontend was deployed
if [ -f "$OUTPUTS_DIR/frontend.json" ]; then
  AMPLIFY_URL=$(json_val "$OUTPUTS_DIR/frontend.json" "TH-FrontendStack" "AmplifyAppUrl")
  if [ -n "$AMPLIFY_URL" ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  🌐 Frontend URL: $AMPLIFY_URL${NC}"
    echo -e "${GREEN}  👤 Username: AppUser${NC}"
    if [ "$FINAL_PASSWORD" != "<your-password>" ] && [ "$FINAL_PASSWORD" != "<temporary-password-from-email>" ]; then
      echo -e "${GREEN}  🔑 Password: (the password you just set)${NC}"
    else
      echo -e "${GREEN}  🔑 Password: (check your email for the temporary password)${NC}"
    fi
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
  fi
fi

print_info "State saved to: $STATE_FILE"
print_info "Outputs saved to: $OUTPUTS_DIR/"
echo ""
print_info "For cleaning up and troubleshooting:"
echo "  • Copy and paste one of the test commands above"
echo "  • Run './status.sh' to view deployment status"
echo "  • Run './deploy-all.sh' again to update (idempotent)"
echo "  • Run './cleanup-all.sh --dry-run' to preview cleanup"
echo ""
echo -e "${YELLOW}⏳ NOTE: If this was a fresh deployment, the Knowledge Base needs~5 minutes${NC}"
echo -e "${YELLOW}   to fully index documents before policy queries return citations.${NC}"
echo -e "${YELLOW}   Wait a few minutes before testing baggage/cancellation/policy questions.${NC}"
echo ""
