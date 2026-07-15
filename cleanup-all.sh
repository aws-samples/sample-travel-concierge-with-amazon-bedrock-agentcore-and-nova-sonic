#!/bin/bash

################################################################################
# Cleanup All - Travel Concierge System
# 
# Deletes all components of the Travel concierge system in reverse order:
# 1. Frontend (Amplify CDK stack)
# 2. Synthetic Data (cleaned with DynamoDB tables in step 5)
# 3. AgentCore Runtime (CDK)
# 4. AgentCore Gateway (CDK)
# 5. Backend Infrastructure (CDK)
#
# Resumable: tracks progress in .deployment-state.json so a failed cleanup
# can be re-run and it will skip already-cleaned components.
#
# Usage:
#   ./cleanup-all.sh [OPTIONS]
#
# Options:
#   --skip-frontend         Skip Frontend cleanup
#   --skip-runtime          Skip AgentCore Runtime cleanup
#   --skip-gateway          Skip AgentCore Gateway cleanup
#   --skip-backend-infra    Skip Backend Infrastructure cleanup
#   --ignore-missing-resources  Continue even if resources don't exist
#   --force                 Skip all confirmation prompts
#   --dry-run               Preview what would be deleted
#   --help                  Show this help message
#
################################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Source state manager
source ./deployment-state.sh

# Configuration
OUTPUTS_DIR="cdk-outputs"
SKIP_FRONTEND=false
SKIP_RUNTIME=false
SKIP_GATEWAY=false
SKIP_BACKEND_INFRA=false
IGNORE_MISSING=true
FORCE=false
CONTINUE_ON_ERROR=true
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --skip-runtime) SKIP_RUNTIME=true; shift ;;
    --skip-gateway) SKIP_GATEWAY=true; shift ;;
    --skip-backend-infra) SKIP_BACKEND_INFRA=true; shift ;;
    --ignore-missing-resources) IGNORE_MISSING=true; CONTINUE_ON_ERROR=true; shift ;;
    --force) FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help) grep "^#" "$0" | grep -v "^#!/" | sed 's/^# //'; exit 0 ;;
    *) echo -e "${RED}❌ Unknown option: $1${NC}"; echo "Use --help for usage information"; exit 1 ;;
  esac
done

# Helper functions
print_section() {
  echo ""
  echo -e "${BLUE}============================================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}============================================================${NC}"
  echo ""
}

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Helper: extract JSON value from file
json_val() {
  local file=$1 stack=$2 key=$3 default=${4:-}
  node -e "const d=JSON.parse(require('fs').readFileSync('$file','utf8')); console.log((d['$stack']||{})['$key']||'$default')" 2>/dev/null || echo "$default"
}

################################################################################
# Pre-flight: Check AWS credentials
################################################################################

print_section "Travel Concierge System - Full Cleanup"

print_info "Checking AWS credentials..."
if ! aws sts get-caller-identity --region us-east-1 > /dev/null 2>&1; then
  print_error "AWS credentials are not configured or have expired."
  print_info "Please set your AWS credentials and try again."
  print_info "Example: export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=..."
  exit 1
fi
print_success "AWS credentials valid"
echo ""

if [ "$DRY_RUN" = true ]; then
  print_warning "DRY RUN MODE - No resources will be deleted"
  echo ""
fi

# Confirmation prompt
if [ "$FORCE" != true ]; then
  echo -e "${YELLOW}⚠️  WARNING: This will delete ALL deployed resources!${NC}"
  echo ""
  echo "This includes:"
  echo "  - Frontend (Amplify App)"
  echo "  - AgentCore Runtime (CDK stacks)"
  echo "  - AgentCore Gateway and targets"
  echo "  - Backend Infrastructure (DynamoDB, Lambda, API Gateway, Cognito, etc.)"
  echo ""
  echo -e "${RED}This action cannot be undone!${NC}"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " response
  
  if [[ "$response" != "yes" && "$response" != "y" ]]; then
    print_info "Cleanup cancelled"
    exit 0
  fi
fi

# Initialize state if it doesn't exist (so we can update it)
init_state

print_info "Starting cleanup in reverse deployment order..."
echo ""

OVERALL_SUCCESS=true

################################################################################
# Step 1: Cleanup Frontend (Amplify CDK)
################################################################################

if [ "$SKIP_FRONTEND" = false ]; then
  print_section "Step 1: Cleaning up Frontend (Amplify)"
  
  FRONTEND_DEPLOYED=$(is_deployed "frontend")
  
  if [ "$FRONTEND_DEPLOYED" = "false" ]; then
    print_info "Frontend not marked as deployed in state, checking CloudFormation..."
  fi
  
  FRONTEND_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name TH-FrontendStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$FRONTEND_STACK_EXISTS" ]; then
    print_info "Frontend stack found, destroying..."
    
    cd frontend/cdk
    
    print_info "Installing dependencies..."
    npm install > /dev/null 2>&1
    
    cdk destroy --force
    
    if [ $? -eq 0 ]; then
      print_success "Frontend stack destroyed successfully"
      
      print_info "Waiting for Frontend stack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name TH-FrontendStack \
        --region us-east-1 2>/dev/null || true
      
      if [ -f "../../$OUTPUTS_DIR/frontend.json" ]; then
        rm "../../$OUTPUTS_DIR/frontend.json"
        print_info "Removed frontend output file"
      fi
      
      update_state "frontend" false '{"url": ""}'
      print_success "Frontend cleaned up successfully"
    else
      print_error "Frontend cleanup failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then cd ../..; exit 1; fi
      OVERALL_SUCCESS=false
    fi
    
    cd ../..
  else
    print_info "Frontend stack does not exist, skipping"
    update_state "frontend" false '{"url": ""}'
  fi
else
  print_warning "Skipping Frontend cleanup"
fi

################################################################################
# Step 2: Synthetic Data
################################################################################

print_section "Step 2: Synthetic Data"
print_info "Synthetic data lives in DynamoDB tables and will be cleaned up"
print_info "when Backend Infrastructure is destroyed in Step 5."
update_state "synthetic-data" false '{"location_count": 0, "customer_count": 0, "menu_item_count": 0, "order_count": 0}'

################################################################################
# Step 3: Cleanup AgentCore Runtime (CDK)
################################################################################

if [ "$SKIP_RUNTIME" = false ]; then
  print_section "Step 3: Cleaning up AgentCore Runtime (CDK)"
  
  RUNTIME_DEPLOYED=$(is_deployed "agentcore-runtime")
  
  if [ "$RUNTIME_DEPLOYED" = "false" ]; then
    print_info "Runtime not marked as deployed in state, checking CloudFormation..."
  fi
  
  cd backend/agentcore-runtime/cdk
  
  print_info "Installing dependencies..."
  npm install > /dev/null 2>&1
  
  # RuntimeStack first (depends on InfraStack)
  RUNTIME_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name TH-AgentCoreRuntimeStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$RUNTIME_STACK_EXISTS" ]; then
    print_info "RuntimeStack found, destroying..."
    
    cdk destroy TH-AgentCoreRuntimeStack --force
    
    if [ $? -eq 0 ]; then
      print_success "RuntimeStack destroyed successfully"
      print_info "Waiting for RuntimeStack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name TH-AgentCoreRuntimeStack \
        --region us-east-1 2>/dev/null || true
    else
      print_error "RuntimeStack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then cd ../../..; exit 1; fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "RuntimeStack does not exist, skipping"
  fi
  
  sleep 3
  
  # InfraStack second
  INFRA_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name TH-AgentCoreInfraStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$INFRA_STACK_EXISTS" ]; then
    print_info "InfraStack found, destroying..."
    
    cdk destroy TH-AgentCoreInfraStack --force
    
    if [ $? -eq 0 ]; then
      print_success "InfraStack destroyed successfully"
      print_info "Waiting for InfraStack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name TH-AgentCoreInfraStack \
        --region us-east-1 2>/dev/null || true
      print_success "AgentCore Runtime cleaned up successfully"
    else
      print_error "InfraStack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then cd ../../..; exit 1; fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "InfraStack does not exist, skipping"
  fi
  
  if [ -f "../../../$OUTPUTS_DIR/agentcore-runtime.json" ]; then
    rm "../../../$OUTPUTS_DIR/agentcore-runtime.json"
    print_info "Removed runtime output file"
  fi
  
  update_state "agentcore-runtime" false '{"stacks": []}'
  
  cd ../../..
else
  print_warning "Skipping AgentCore Runtime cleanup"
fi

################################################################################
# Step 4: Cleanup AgentCore Gateway (CDK)
################################################################################

if [ "$SKIP_GATEWAY" = false ]; then
  print_section "Step 4: Cleaning up AgentCore Gateway (CDK)"
  
  GATEWAY_DEPLOYED=$(is_deployed "agentcore-gateway")
  
  if [ "$GATEWAY_DEPLOYED" = "false" ]; then
    print_info "Gateway not marked as deployed in state, checking CloudFormation..."
  fi
  
  cd backend/agentcore-gateway/cdk
  
  print_info "Installing dependencies..."
  npm install > /dev/null 2>&1
  
  GATEWAY_STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name TH-AgentCoreGatewayStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$GATEWAY_STACK_EXISTS" ]; then
    print_info "Gateway stack found, destroying..."
    print_info "This will delete Gateway, Targets, and IAM service role..."
    
    # Get API Gateway ID for CDK context
    API_GATEWAY_ID=""
    if [ -f "../../../$OUTPUTS_DIR/backend-infrastructure.json" ]; then
      API_GATEWAY_ID=$(json_val "../../../$OUTPUTS_DIR/backend-infrastructure.json" "TH-ApiGatewayStack" "ApiGatewayId")
    fi
    
    if [ -z "$API_GATEWAY_ID" ]; then
      print_warning "Could not find API Gateway ID, using placeholder for destroy..."
      API_GATEWAY_ID="dummy"
    fi
    
    cdk destroy --context apiGatewayId=$API_GATEWAY_ID --context knowledgeBaseId=dummy --force
    
    if [ $? -eq 0 ]; then
      print_success "Gateway stack destroyed successfully"
      
      print_info "Waiting for Gateway stack deletion to complete..."
      aws cloudformation wait stack-delete-complete \
        --stack-name TH-AgentCoreGatewayStack \
        --region us-east-1 2>/dev/null || true
      
      if [ -f "../../../$OUTPUTS_DIR/agentcore-gateway.json" ]; then
        rm "../../../$OUTPUTS_DIR/agentcore-gateway.json"
        print_info "Removed gateway output file"
      fi
      
      update_state "agentcore-gateway" false '{"gateway_id": ""}'
      print_success "AgentCore Gateway cleaned up successfully"
    else
      print_error "Gateway stack destruction failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then cd ../../..; exit 1; fi
      OVERALL_SUCCESS=false
    fi
  else
    print_info "Gateway stack does not exist, skipping"
    update_state "agentcore-gateway" false '{"gateway_id": ""}'
  fi
  
  cd ../../..
else
  print_warning "Skipping AgentCore Gateway cleanup"
fi

################################################################################
# Step 4.5: Pre-cleanup orphaned AgentCore Gateway resources
#
# The gateway resource persists in Bedrock even when the CFN stack rolls back.
# Clean up before Step 5 so redeployment works cleanly.
################################################################################

if [ "$SKIP_BACKEND_INFRA" = false ]; then
  print_section "Step 4.5: Pre-cleaning orphaned Gateway resources"

  # ── Orphaned AgentCore Gateway cleanup ────────────────────────────────────
  ORPHAN_GW_ID=$(aws bedrock-agentcore-control list-gateways \
    --region us-east-1 \
    --query "items[?starts_with(name, 'th-concierge-gateway')].gatewayId" \
    --output text 2>/dev/null || echo "")

  if [ -n "$ORPHAN_GW_ID" ] && [ "$ORPHAN_GW_ID" != "None" ]; then
    print_info "Found orphaned gateway: $ORPHAN_GW_ID — deleting targets and gateway..."
    TARGET_IDS=$(aws bedrock-agentcore-control list-gateway-targets \
      --gateway-identifier "$ORPHAN_GW_ID" --region us-east-1 \
      --query "items[].targetId" --output text 2>/dev/null || echo "")
    for TID in $TARGET_IDS; do
      [ -n "$TID" ] && [ "$TID" != "None" ] && \
        aws bedrock-agentcore-control delete-gateway-target \
          --gateway-identifier "$ORPHAN_GW_ID" --target-id "$TID" \
          --region us-east-1 > /dev/null 2>&1 && print_info "  Target $TID deleted"
    done
    sleep 5
    aws bedrock-agentcore-control delete-gateway \
      --gateway-identifier "$ORPHAN_GW_ID" --region us-east-1 > /dev/null 2>&1 \
      && print_success "Orphaned gateway deleted" \
      || print_warning "Could not delete orphaned gateway (non-fatal)"
  else
    print_info "No orphaned gateway found"
  fi
fi

################################################################################
# Step 5: Cleanup Backend Infrastructure (CDK)
################################################################################

if [ "$SKIP_BACKEND_INFRA" = false ]; then
  print_section "Step 5: Cleaning up Backend Infrastructure (CDK)"
  
  BACKEND_DEPLOYED=$(is_deployed "backend-infrastructure")
  
  if [ "$BACKEND_DEPLOYED" = "false" ]; then
    print_info "Backend not marked as deployed in state, checking CloudFormation..."
  fi
  
  # Check if any backend stack exists
  ANY_BACKEND_STACK=$(aws cloudformation describe-stacks \
    --stack-name TH-DynamoDBStack \
    --region us-east-1 \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$ANY_BACKEND_STACK" ]; then
    cd backend/backend-infrastructure
    
    print_info "Installing dependencies..."
    npm install > /dev/null 2>&1
    
    print_info "Destroying Backend Infrastructure stacks..."
    print_warning "This will delete DynamoDB tables (including synthetic data), Lambda functions, API Gateway, Cognito, etc."
    
    # Delete stacks one at a time with pauses to avoid API Gateway 429 rate limits
    # Order: reverse dependency (API Gateway first, DynamoDB last)
    BACKEND_STACKS=("TH-ApiGatewayStack" "TH-LambdaStack" "TH-CognitoStack" "TH-DynamoDBStack" "TH-KnowledgeBaseStack")
    BACKEND_DESTROY_OK=true
    
    for stack in "${BACKEND_STACKS[@]}"; do
      STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name "$stack" \
        --region us-east-1 \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "")
      
      if [ -z "$STACK_STATUS" ]; then
        print_info "$stack does not exist, skipping"
        continue
      fi

      # If already in DELETE_FAILED, force-delete with --retain-resources to skip stuck resources
      if [ "$STACK_STATUS" = "DELETE_FAILED" ]; then
        print_warning "$stack is in DELETE_FAILED — force-deleting with retain..."
        FAILED_RESOURCES=$(aws cloudformation describe-stacks \
          --stack-name "$stack" \
          --region us-east-1 \
          --query 'Stacks[0].StackStatusReason' \
          --output text 2>/dev/null || echo "")
        # Extract logical resource IDs from the failure reason (e.g. "ManagedKB")
        # Use python3 to parse the reason string (avoids grep -P incompatibility on macOS)
        RETAIN_IDS=$(python3 -c "
import re, sys
reason = '''$FAILED_RESOURCES'''
matches = re.findall(r'\[([^\]]+)\]', reason)
if matches:
    ids = matches[0].replace(',', ' ').strip()
    print(ids)
" 2>/dev/null || echo "")
        if [ -n "$RETAIN_IDS" ]; then
          aws cloudformation delete-stack \
            --stack-name "$stack" \
            --retain-resources $RETAIN_IDS \
            --region us-east-1 2>/dev/null
        else
          aws cloudformation delete-stack --stack-name "$stack" --region us-east-1 2>/dev/null
        fi
        aws cloudformation wait stack-delete-complete --stack-name "$stack" --region us-east-1 2>/dev/null || true
        STILL_EXISTS=$(aws cloudformation describe-stacks --stack-name "$stack" --region us-east-1 --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "")
        if [ -z "$STILL_EXISTS" ] || [ "$STILL_EXISTS" = "DELETE_COMPLETE" ]; then
          print_success "$stack force-deleted"
        else
          print_error "$stack still exists (status: $STILL_EXISTS)"
          BACKEND_DESTROY_OK=false
        fi
        sleep 5
        continue
      fi
      
      print_info "Destroying $stack..."
      cdk destroy "$stack" --force
      
      if [ $? -eq 0 ]; then
        print_info "Waiting for $stack deletion (up to 15 min)..."
        for i in $(seq 1 90); do
          STATUS=$(aws cloudformation describe-stacks --stack-name "$stack" --region us-east-1 \
            --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETED")
          if [ -z "$STATUS" ] || [ "$STATUS" = "DELETED" ] || [ "$STATUS" = "DELETE_COMPLETE" ]; then
            break
          fi
          [ "$i" -eq 1 ] && printf "  Polling"
          printf "."
          sleep 10
        done
        echo ""
        print_success "$stack destroyed"
      else
        # If DELETE_FAILED, retry once after a pause (handles 429 rate limits)
        print_warning "$stack failed, retrying after 10s pause..."
        sleep 10
        aws cloudformation delete-stack --stack-name "$stack" --region us-east-1 2>/dev/null
        for i in $(seq 1 90); do
          STATUS=$(aws cloudformation describe-stacks --stack-name "$stack" --region us-east-1 \
            --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETED")
          if [ -z "$STATUS" ] || [ "$STATUS" = "DELETED" ] || [ "$STATUS" = "DELETE_COMPLETE" ]; then
            break
          fi
          [ "$i" -eq 1 ] && printf "  Polling"
          printf "."
          sleep 10
        done
        echo ""
        
        # Check if it actually got deleted
        STILL_EXISTS=$(aws cloudformation describe-stacks \
          --stack-name "$stack" \
          --region us-east-1 \
          --query 'Stacks[0].StackStatus' \
          --output text 2>/dev/null || echo "")
        
        if [ -z "$STILL_EXISTS" ] || [ "$STILL_EXISTS" = "DELETE_COMPLETE" ]; then
          print_success "$stack destroyed on retry"
        else
          print_error "$stack still exists (status: $STILL_EXISTS)"
          BACKEND_DESTROY_OK=false
        fi
      fi
      
      # Pause between stacks to avoid rate limits
      sleep 5
    done
    
    if [ "$BACKEND_DESTROY_OK" = true ]; then
      print_success "Backend Infrastructure cleaned up successfully"
      
      if [ -f "../../$OUTPUTS_DIR/backend-infrastructure.json" ]; then
        rm "../../$OUTPUTS_DIR/backend-infrastructure.json"
        print_info "Removed backend infrastructure output file"
      fi
      
      update_state "backend-infrastructure" false '{"stacks": [], "password_changed": false}'
    else
      print_error "Backend Infrastructure cleanup failed"
      if [ "$CONTINUE_ON_ERROR" = false ]; then cd ../..; exit 1; fi
      OVERALL_SUCCESS=false
    fi
    
    cd ../..
  else
    print_info "Backend infrastructure stacks do not exist, skipping"
    update_state "backend-infrastructure" false '{"stacks": [], "password_changed": false}'
  fi
else
  print_warning "Skipping Backend Infrastructure cleanup"
fi

################################################################################
# Step 5.5: Bedrock KB cleanup (safety net)
# CfnDataSource + CfnKnowledgeBase with RemovalPolicy.DESTROY handle deletion
# automatically via CDK. This step only cleans up orphaned KBs left by failed
# deployments where the stack was never created.
################################################################################

if [ "$SKIP_BACKEND_INFRA" = false ]; then
  ORPHAN_KB=$(aws bedrock-agent list-knowledge-bases --region us-east-1 \
    --query "knowledgeBaseSummaries[?name=='th-travel-policies'].knowledgeBaseId" \
    --output text 2>/dev/null || echo "")

  if [ -n "$ORPHAN_KB" ] && [ "$ORPHAN_KB" != "None" ]; then
    KB_IN_CFN=$(aws cloudformation list-exports --region us-east-1 \
      --query "Exports[?Name=='TH-KnowledgeBaseId'].Value" --output text 2>/dev/null || echo "")
    if [ -z "$KB_IN_CFN" ] || [ "$KB_IN_CFN" = "None" ]; then
      print_info "Found orphaned KB $ORPHAN_KB (not in CFN) — deleting..."
      DS_IDS=$(aws bedrock-agent list-data-sources --knowledge-base-id "$ORPHAN_KB" \
        --region us-east-1 --query "dataSourceSummaries[].dataSourceId" --output text 2>/dev/null)
      for DS_ID in $DS_IDS; do
        [ -n "$DS_ID" ] && aws bedrock-agent delete-data-source \
          --knowledge-base-id "$ORPHAN_KB" --data-source-id "$DS_ID" \
          --region us-east-1 > /dev/null 2>&1 && sleep 5
      done
      aws bedrock-agent delete-knowledge-base --knowledge-base-id "$ORPHAN_KB" \
        --region us-east-1 > /dev/null 2>&1 && print_success "Orphaned KB deleted"
    fi
  fi
fi

################################################################################
# Step 6: Cleanup SES Email Identity
################################################################################

print_section "Step 6: SES Email Identity"
# SES email identity is intentionally NOT deleted during cleanup.
# Once verified, it should persist across deploy/cleanup cycles so
# the user does not receive repeated verification emails.
print_info "SES email identity retained (already verified — no action needed)"

################################################################################
# Cleanup Complete
################################################################################

print_section "Cleanup Complete!"

# Remove state file only if everything succeeded
if [ "$DRY_RUN" = false ] && [ "$OVERALL_SUCCESS" = true ] && [ -f "$STATE_FILE_ABS" ]; then
  rm "$STATE_FILE_ABS"
  print_info "Removed deployment state file"
elif [ "$DRY_RUN" = false ] && [ "$OVERALL_SUCCESS" = false ]; then
  print_warning "State file preserved — re-run cleanup to finish remaining components"
fi

# Remove outputs directory if empty
if [ -d "$OUTPUTS_DIR" ]; then
  if [ -z "$(ls -A $OUTPUTS_DIR)" ]; then
    if [ "$DRY_RUN" = false ]; then
      rmdir "$OUTPUTS_DIR"
      print_info "Removed empty outputs directory"
    fi
  else
    print_warning "Outputs directory still contains files"
  fi
fi

if [ "$DRY_RUN" = true ]; then
  print_warning "DRY RUN completed - no resources were deleted"
  echo ""
  print_info "Run without --dry-run to actually delete resources"
elif [ "$OVERALL_SUCCESS" = true ]; then
  print_success "All resources cleaned up successfully"
  echo ""
  print_info "To redeploy, run: ./deploy-all.sh --user-email your@email.com --user-name \"Your Name\""
else
  print_warning "Some resources may not have been cleaned up. Check the errors above."
  echo ""
  print_info "Re-run ./cleanup-all.sh to resume — already-cleaned components will be skipped."
  exit 1
fi
