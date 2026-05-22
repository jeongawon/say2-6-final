#!/bin/bash
set -e

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/../database/aurora/aurora-stack.yaml"

echo "=========================================="
echo "say2-6team Aurora Serverless v2 Deployment"
echo "Region: ${REGION}"
echo "=========================================="

# Check template file
if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "[FAIL] Template file not found!"
  echo "   Expected: ${TEMPLATE_FILE}"
  exit 1
fi
echo "[OK] Template file verified"

# Check prerequisite stacks
check_stack() {
  local STACK_NAME="$1"
  local LABEL="$2"
  local STATUS
  STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

  if [[ "$STATUS" == "CREATE_COMPLETE" || "$STATUS" == "UPDATE_COMPLETE" ]]; then
    echo "[OK] ${LABEL} verified"
  else
    echo "[FAIL] ${LABEL} not ready! (Status: ${STATUS})"
    exit 1
  fi
}

check_stack "${PROJECT_NAME}-network"  "Network stack"
check_stack "${PROJECT_NAME}-security" "Security stack (Aurora SG available)"

echo ""
# Pre-cleanup: force-delete any leftover Secrets Manager secret from previous failed deployments
# Secrets Manager has a 7-day recovery window by default, which causes AlreadyExists on redeploy
SECRET_ID="${PROJECT_NAME}/aurora-credentials"
SECRET_STATUS=$(aws secretsmanager describe-secret \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query "DeletedDate" \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$SECRET_STATUS" == "NOT_FOUND" ]; then
  echo "[OK] No leftover secret found"
else
  echo "Leftover secret detected. Force-deleting: ${SECRET_ID}"
  aws secretsmanager delete-secret \
    --secret-id "$SECRET_ID" \
    --force-delete-without-recovery \
    --region "$REGION" 2>/dev/null || true
  echo "[OK] Secret force-deleted"
fi
echo ""
echo "Deploying Aurora Serverless v2 stack..."
echo "This will take 15-20 minutes..."
echo ""

# Deploy Aurora Stack (auto-detect create or update)
aws cloudformation deploy \
  --stack-name "${PROJECT_NAME}-aurora" \
  --template-file "$TEMPLATE_FILE" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides EnableRotation=false \
  --region "${REGION}" \
  --tags \
    Project="${PROJECT_NAME}" \
    Owner=yji \
    Environment=dev

echo ""
echo "[OK] Aurora Stack deployed successfully!"
echo ""

# Output endpoints
AURORA_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-aurora" \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' \
  --output text \
  --region "${REGION}")

AURORA_READ_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-aurora" \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterReadEndpoint`].OutputValue' \
  --output text \
  --region "${REGION}")

echo "=========================================="
echo "Aurora Deployment Complete!"
echo "=========================================="
echo ""
echo "  Writer Endpoint: ${AURORA_ENDPOINT}"
echo "  Reader Endpoint: ${AURORA_READ_ENDPOINT}"
echo ""
echo "Next steps:"
echo "  1. Run DB migrations (migrations.yaml)"
echo "  2. Run: bash deploy-compute.sh"
echo ""
