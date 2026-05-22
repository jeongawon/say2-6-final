#!/bin/bash

# ============================================================
# say2-6team 시연용 간소화 배포 스크립트
# Aurora DB와 모니터링 스택 제외
# ============================================================

set -e

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "say2-6team Demo Deployment (Simplified)"
echo "Region: ap-northeast-2 (Seoul)"
echo "=========================================="
echo ""

# ------------------------------------------------------------
# 사전 확인
# ------------------------------------------------------------
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not found."
  exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ AWS credentials not configured."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS Account: ${ACCOUNT_ID}"
echo ""

# ------------------------------------------------------------
# Step 1: Network Stack 확인
# ------------------------------------------------------------
echo "[1/4] Checking Network Stack..."
NETWORK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-network" \
  --region "${REGION}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$NETWORK_STATUS" == "CREATE_COMPLETE" || "$NETWORK_STATUS" == "UPDATE_COMPLETE" ]]; then
  echo "✅ Network stack verified"
else
  echo "❌ Network stack not found! Deploy it first."
  echo "   cd AWS/network"
  echo "   aws cloudformation deploy --stack-name ${PROJECT_NAME}-network --template-file network-stack.yaml --region ${REGION}"
  exit 1
fi
echo ""

# ------------------------------------------------------------
# Step 2: Security Stack 배포 (create or update 자동 판단)
# ------------------------------------------------------------
echo "[2/4] Deploying Security Stack..."

aws cloudformation deploy \
  --stack-name "${PROJECT_NAME}-security" \
  --template-file "${SCRIPT_DIR}/../Security/security-stack.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --tags \
    Project="${PROJECT_NAME}" \
    Owner=lji \
    Environment=dev

echo "✅ Security stack deployed!"
echo ""

# ------------------------------------------------------------
# Step 3: ECR Repositories 생성
# ------------------------------------------------------------
echo "[3/4] Creating ECR Repositories..."

for REPO in orchestrator cxr-svc ecg-svc lab-svc router-svc; do
  REPO_NAME="${PROJECT_NAME}-${REPO}"
  if aws ecr describe-repositories \
      --repository-names "${REPO_NAME}" \
      --region "${REGION}" &>/dev/null; then
    echo "  ✅ ${REPO_NAME} already exists"
  else
    aws ecr create-repository \
      --repository-name "${REPO_NAME}" \
      --region "${REGION}" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      --tags Key=Project,Value="${PROJECT_NAME}" Key=Owner,Value=lji
    echo "  ✅ ${REPO_NAME} created"
  fi
done
echo ""

# ------------------------------------------------------------
# Step 4: 완료 메시지
# ------------------------------------------------------------
echo "=========================================="
echo "✅ Infrastructure stacks deployed!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Build and push Docker images:"
echo "     bash build-and-push.sh"
echo ""
echo "  2. Deploy Aurora DB:"
echo "     bash deploy-aurora.sh"
echo ""
echo "  3. Deploy compute stack:"
echo "     bash deploy-compute.sh"
echo ""
