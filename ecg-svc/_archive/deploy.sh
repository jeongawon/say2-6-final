#!/bin/bash
set -e

# say-6 ECG 모달 — ECR 빌드 + 푸시
#
# 운영 ECR repo: say2-6team-ecg-svc (CXR/LAB/orchestrator와 통일 네이밍)
# (옛 repo였던 'ecg-modal'은 사용 안 함, 2026-04 이후 deprecated)
#
# 실행 위치: project root (./ecg-svc 디렉토리 build context 가정)
#   cd /Users/wonjeonga/Desktop/say-6-project
#   bash ecg-svc/deploy.sh
#
# 배포 후 EC2(52.79.251.216)에서 새 이미지 pull + 컨테이너 재시작 필요.

ACCOUNT_ID=666803869796
REGION=ap-northeast-2
ECR_REPO=say2-6team-ecg-svc
IMAGE_TAG=latest
ECR_URI=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG

echo "=== 1. ECR 로그인 ==="
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

echo "=== 2. ECR 레포지토리 확인 (없으면 생성) ==="
aws ecr create-repository --repository-name $ECR_REPO --region $REGION 2>/dev/null || \
  echo "  (이미 존재 — 그대로 사용)"

echo "=== 3. Docker 이미지 빌드 (linux/amd64 — EC2 호환) ==="
docker buildx build --platform linux/amd64 -t $ECR_REPO:$IMAGE_TAG ./ecg-svc --load

echo "=== 4. ECR 푸시 ==="
docker tag $ECR_REPO:$IMAGE_TAG $ECR_URI
docker push $ECR_URI

echo ""
echo "✅ 완료: $ECR_URI"
echo ""
echo "다음 단계 — EC2(52.79.251.216)에서:"
echo "  aws ecr get-login-password --region $REGION | \\"
echo "    docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
echo "  docker pull $ECR_URI"
echo "  docker stop <old-ecg-container> && docker rm <old-ecg-container>"
echo "  docker run -d --name ecg-svc -p 8003:8000 \\"
echo "    -v ~/.aws:/root/.aws:ro \\"
echo "    -e AWS_DEFAULT_REGION=$REGION \\"
echo "    $ECR_URI"
