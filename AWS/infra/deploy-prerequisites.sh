#!/bin/bash

# ============================================================
# say2-6team Prerequisites Deployment Script
# ============================================================
# 
# Deployment order:
#   1. Network Stack (already deployed - Yang Jeong-in)
#   2. Security Stack (provided by security team - KMS, SG, IAM Roles)
#   3. ECR Repositories
#
# ============================================================

set -e
export MSYS_NO_PATHCONV=1

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "=========================================="
echo "say2-6team Prerequisites Deployment"
echo "Region: ${REGION}"
echo "Account: ${ACCOUNT_ID}"
echo "=========================================="
echo ""

# ------------------------------------------------------------
# 1. Check Network Stack
# ------------------------------------------------------------
echo "[1/3] Checking Network Stack..."
NETWORK_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-network \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$NETWORK_STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$NETWORK_STACK_STATUS" == "UPDATE_COMPLETE" ]; then
    echo "[OK] Network stack already deployed"
else
    echo "[FAIL] Network stack not found or not complete!"
    echo "   Status: $NETWORK_STACK_STATUS"
    echo "   Network stack should be deployed by Yang Jeong-in"
    exit 1
fi
echo ""

# ------------------------------------------------------------
# 2. Check Security Stack (already deployed by security team)
# ------------------------------------------------------------
echo "[2/3] Checking Security Stack..."
SECURITY_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-security \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$SECURITY_STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$SECURITY_STACK_STATUS" == "UPDATE_COMPLETE" ]; then
    echo "[OK] Security stack already deployed (provided by security team)"
    echo "   Stack includes: KMS, Security Groups, IAM Roles, Cognito, WAF"
else
    echo "[FAIL] Security stack not found or not complete!"
    echo "   Status: $SECURITY_STACK_STATUS"
    echo "   Security stack (say2-6team-security) should be deployed by security team"
    echo "   Template location: AWS/security-stack.yaml"
    exit 1
fi
echo ""

# ------------------------------------------------------------
# 3. Create ECR Repositories
# ------------------------------------------------------------
echo "[3/3] Creating ECR Repositories..."

REPOS=("orchestrator" "cxr-svc" "ecg-svc" "lab-svc" "router-svc" "rag-svc")

for REPO in "${REPOS[@]}"; do
    REPO_NAME="${PROJECT_NAME}-${REPO}"
    
    # Check if repository exists
    if aws ecr describe-repositories \
        --repository-names ${REPO_NAME} \
        --region ${REGION} >/dev/null 2>&1; then
        echo "  [OK] ${REPO_NAME} already exists"
    else
        echo "  Creating ${REPO_NAME}..."
        aws ecr create-repository \
          --repository-name ${REPO_NAME} \
          --region ${REGION} \
          --image-scanning-configuration scanOnPush=true \
          --encryption-configuration encryptionType=AES256 \
          --tags Key=Project,Value=${PROJECT_NAME} Key=Owner,Value=lji
        echo "  [OK] ${REPO_NAME} created"
    fi
done

echo ""
echo "=========================================="
echo "[OK] Prerequisites deployment complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Build and push Docker images:"
echo "     bash build-and-push.sh"
echo ""
echo "  2. Deploy compute stack:"
echo "     bash deploy-compute.sh"
echo ""
