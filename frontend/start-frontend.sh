#!/bin/bash

# ============================================================
# say2-6 프론트엔드 실행 스크립트
# ============================================================

set -e

echo "=========================================="
echo "say2-6 프론트엔드 실행 준비"
echo "=========================================="
echo ""

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다."
    echo "   https://nodejs.org/ 에서 LTS 버전을 다운로드하세요."
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js: $NODE_VERSION"

# npm 확인
if ! command -v npm &> /dev/null; then
    echo "❌ npm이 설치되지 않았습니다."
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm: $NPM_VERSION"
echo ""

# 의존성 설치 확인
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중... (1-2분 소요)"
    npm install
    echo "✅ 의존성 설치 완료"
    echo ""
else
    echo "✅ 의존성이 이미 설치되어 있습니다."
    echo ""
fi

# 백엔드 연결 테스트
echo "🔗 백엔드 연결 테스트 중..."
BACKEND_URL=$(grep VITE_BACKEND_URL .env.local | cut -d '=' -f2)
echo "   백엔드 URL: $BACKEND_URL"

if curl -s -f "${BACKEND_URL}/orchestrator/health" > /dev/null 2>&1; then
    echo "✅ 백엔드 연결 성공"
else
    echo "⚠️  백엔드 연결 실패 - ECS Service 상태를 확인하세요"
    echo ""
    echo "   다음 명령어로 확인:"
    echo "   aws ecs describe-services --cluster say2-6team-ecs-cluster --services say2-6team-orchestrator-service --region ap-northeast-2"
    echo ""
    echo "   계속 진행하려면 Enter를 누르세요..."
    read
fi

echo ""
echo "=========================================="
echo "🚀 say2-6 프론트엔드 시작"
echo "=========================================="
echo ""
echo "📍 접속 주소:"
echo "   http://localhost:3000"
echo ""
echo "📄 주요 페이지:"
echo "   • 홈페이지:        http://localhost:3000/"
echo "   • 제품 소개:       http://localhost:3000/product"
echo "   • Live Demo:       http://localhost:3000/demo"
echo "   • Triage:          http://localhost:3000/demo/triage"
echo "   • Worklist:        http://localhost:3000/demo/worklist"
echo "   • Dashboard:       http://localhost:3000/demo/dashboard"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"
echo ""

# 개발 서버 시작
npm run dev
