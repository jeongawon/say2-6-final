#!/bin/bash
set -e

# ============================================================
# Router Service 단독 빌드 & ECR 푸시 스크립트
# router-svc만 따로 업데이트할 때 사용
# 전체 빌드는 build-and-push.sh 사용
# ============================================================

AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME="say2-6team-router-svc"
IMAGE_TAG="${1:-latest}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTER_SVC_DIR="${SCRIPT_DIR}/../../router-svc"

echo "=========================================="
echo "Router Service ECR 배포"
echo "=========================================="
echo "AWS Region:  ${AWS_REGION}"
echo "AWS Account: ${AWS_ACCOUNT_ID}"
echo "ECR Repo:    ${ECR_REPO_NAME}"
echo "Image Tag:   ${IMAGE_TAG}"
echo "Source:      ${ROUTER_SVC_DIR}"
echo "=========================================="

# Dockerfile 확인
if [ ! -f "${ROUTER_SVC_DIR}/Dockerfile" ]; then
  echo "❌ Dockerfile not found at ${ROUTER_SVC_DIR}/Dockerfile"
  exit 1
fi

# ECR 로그인
echo "ECR 로그인 중..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# ECR 리포지토리 생성 (없으면)
echo "ECR 리포지토리 확인 중..."
aws ecr describe-repositories --repository-names "${ECR_REPO_NAME}" --region "${AWS_REGION}" 2>/dev/null || \
  aws ecr create-repository \
    --repository-name "${ECR_REPO_NAME}" \
    --region "${AWS_REGION}" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256

# Docker 이미지 빌드 (router-svc 디렉토리 기준)
echo "Docker 이미지 빌드 중..."
docker build -t "${ECR_REPO_NAME}:${IMAGE_TAG}" "${ROUTER_SVC_DIR}"

# ECR 푸시
ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:${IMAGE_TAG}"
echo "ECR 푸시 중..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "${ECR_IMAGE_URI}"
docker push "${ECR_IMAGE_URI}"

echo ""
echo "=========================================="
echo "✅ 배포 완료!"
echo "=========================================="
echo "Image URI: ${ECR_IMAGE_URI}"
echo ""
echo "Compute Stack 업데이트:"
echo ""
echo "aws cloudformation deploy \\"
echo "  --stack-name say2-6team-compute \\"
echo "  --template-file ${SCRIPT_DIR}/compute-stack.yaml \\"
echo "  --parameter-overrides RouterSvcImageUri=${ECR_IMAGE_URI} \\"
echo "  --capabilities CAPABILITY_IAM \\"
echo "  --region ${AWS_REGION}"
echo "=========================================="
