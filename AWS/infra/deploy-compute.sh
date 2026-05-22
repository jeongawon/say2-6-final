#!/bin/bash

# ============================================================
# say2-6team Compute Stack Deployment Script
# Prerequisites: Security stack and Aurora stack must be deployed
# ============================================================

set -e

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "say2-6team Compute Stack Deployment"
echo "Region: ap-northeast-2 (Seoul)"
echo "=========================================="
echo ""

# ------------------------------------------------------------
# Check prerequisites
# ------------------------------------------------------------
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
    echo "[OK] ${LABEL} verified (${STATUS})"
  else
    echo "[FAIL] ${LABEL} not ready! (Status: ${STATUS})"
    echo "   Stack: ${STACK_NAME}"
    exit 1
  fi
}

echo "Checking prerequisites..."
check_stack "${PROJECT_NAME}-network"  "Network stack"
check_stack "${PROJECT_NAME}-security" "Security stack"
check_stack "${PROJECT_NAME}-aurora"   "Aurora stack"

# Check ECR Repositories
echo "Checking ECR repositories..."
MISSING_REPOS=()
for REPO in "orchestrator" "cxr-svc" "ecg-svc" "lab-svc" "router-svc"; do
  REPO_NAME="${PROJECT_NAME}-${REPO}"
  if ! aws ecr describe-repositories \
      --repository-names "${REPO_NAME}" \
      --region "${REGION}" >/dev/null 2>&1; then
    MISSING_REPOS+=("${REPO_NAME}")
  fi
done

if [ ${#MISSING_REPOS[@]} -gt 0 ]; then
  echo "[FAIL] Missing ECR repositories:"
  for REPO in "${MISSING_REPOS[@]}"; do
    echo "   - ${REPO}"
  done
  echo "   Run: bash deploy-prerequisites.sh"
  exit 1
fi
echo "[OK] ECR repositories verified"

# Check if compute-stack-params.json exists
if [ ! -f "${SCRIPT_DIR}/compute-stack-params.json" ]; then
  echo "[FAIL] compute-stack-params.json not found!"
  echo "   Run: bash build-and-push.sh"
  exit 1
fi
echo "[OK] compute-stack-params.json found"

echo ""
echo "[OK] All prerequisites verified!"
echo ""

# ------------------------------------------------------------
# Deploy Compute Stack (auto-detect create or update)
# ------------------------------------------------------------
echo "Deploying Compute Stack..."
echo "This will take 10-15 minutes..."
echo ""

PARAM_OVERRIDES=$(python "${SCRIPT_DIR}/parse_params.py" "${SCRIPT_DIR}/compute-stack-params.json")

aws cloudformation deploy \
  --stack-name "${PROJECT_NAME}-compute" \
  --template-file "${SCRIPT_DIR}/compute-stack.yaml" \
  --parameter-overrides $PARAM_OVERRIDES \
  --capabilities CAPABILITY_IAM \
  --region "${REGION}" \
  --tags \
    Project="${PROJECT_NAME}" \
    Owner=lji \
    Environment=dev

echo ""
echo "[OK] Compute Stack deployed successfully!"
echo ""

# ------------------------------------------------------------
# Output ALB DNS
# ------------------------------------------------------------
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-compute" \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region "${REGION}")

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "ALB DNS: ${ALB_DNS}"
echo ""
echo "Health check endpoints:"
echo "  Orchestrator: http://${ALB_DNS}/orchestrator/health"
echo "  CXR Service:  http://${ALB_DNS}/cxr/healthz"
echo "  ECG Service:  http://${ALB_DNS}/ecg/health"
echo "  Lab Service:  http://${ALB_DNS}/lab/health"
echo "  Router:       http://${ALB_DNS}/route/health"
echo ""
echo "Next steps:"
echo "  1. Wait 2-3 minutes for ECS services to become healthy"
echo "  2. Test health endpoints above"
echo "  3. Configure frontend with ALB DNS"
echo ""
