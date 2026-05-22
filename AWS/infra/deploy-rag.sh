#!/bin/bash
set -e

# ============================================================
# RAG Service Stack Deployment Script
# Depends on: network-stack, security-stack, compute-stack
# Deployment order: must be deployed after compute-stack
# ============================================================

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# data-rag-stack.yaml actual location: AWS/Data-RAG/data-rag-stack.yaml
TEMPLATE_FILE="${SCRIPT_DIR}/../Data-RAG/data-rag-stack.yaml"
RAG_IMAGE_TAG="${1:-latest}"

echo "=========================================="
echo "say2-6team RAG Service Stack Deployment"
echo "Region: ${REGION}"
echo "=========================================="

# Verify template
if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "[FAIL] Template not found: ${TEMPLATE_FILE}"
  echo "   Expected: AWS/Data-RAG/data-rag-stack.yaml"
  exit 1
fi
echo "[OK] Template verified: ${TEMPLATE_FILE}"

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
check_stack "${PROJECT_NAME}-security" "Security stack"
check_stack "${PROJECT_NAME}-compute"  "Compute stack"

# Get RAG image URI from ECR
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
RAG_IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT_NAME}-rag-svc:${RAG_IMAGE_TAG}"

# Get ECS Cluster ARN export from compute-stack
# data-rag-stack references it directly via ImportValue, so no parameter needed
# (data-rag-stack.yaml RAGService.Cluster: !ImportValue say2-6team-ecs-cluster-arn)
ECS_CLUSTER_ARN=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-compute" \
  --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterArn`].OutputValue' \
  --output text \
  --region "${REGION}" 2>/dev/null || echo "")

if [ -z "$ECS_CLUSTER_ARN" ]; then
  echo "[WARN]  ECS Cluster ARN not found in compute-stack outputs."
  echo "   data-rag-stack uses !ImportValue say2-6team-ecs-cluster-arn directly."
  echo "   Proceeding - deploy will fail if compute-stack export is missing."
fi

echo ""
echo "RAG Image URI: ${RAG_IMAGE_URI}"
echo ""
echo "Deploying RAG Service Stack..."
echo "(S3 bucket creation + ECS Service startup takes approximately 5-10 minutes)"
echo ""

aws cloudformation deploy \
  --stack-name "${PROJECT_NAME}-rag" \
  --template-file "$TEMPLATE_FILE" \
  --parameter-overrides \
    ProjectName="${PROJECT_NAME}" \
    Environment=dev \
    Owner=yji \
    RAGContainerImage="${RAG_IMAGE_URI}" \
    ECSClusterArn="${ECS_CLUSTER_ARN}" \
  --capabilities CAPABILITY_IAM \
  --region "${REGION}" \
  --tags \
    Project="${PROJECT_NAME}" \
    Owner=yji \
    Environment=dev

echo ""
echo "=========================================="
echo "[OK] RAG Stack deployed!"
echo "=========================================="
echo ""
echo "Cloud Map DNS: rag-svc.${PROJECT_NAME}.local:8000"
echo ""
echo "Endpoints (VPC internal):"
echo "  GET  /health"
echo "  POST /query    - returns search results only (when orchestrator is healthy)"
echo "  POST /generate - generates report (when router is in fallback mode)"
echo ""
echo "CloudWatch Logs: /drai/rag"
echo ""
