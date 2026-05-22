#!/bin/bash

# ============================================================
# Router Service 로컬 실행 스크립트
# ============================================================

# 환경변수 설정
export HOST="0.0.0.0"
export PORT="8004"
export LOG_LEVEL="INFO"

# 로컬 테스트용 URL (실제 서비스가 없으면 에러 발생)
export ECG_SVC_URL="http://localhost:8001"
export CXR_SVC_URL="http://localhost:8002"
export LAB_SVC_URL="http://localhost:8003"
export RAG_SVC_URL="http://localhost:8000"

export REQUEST_TIMEOUT="300"

echo "=========================================="
echo "Router Service 로컬 실행"
echo "=========================================="
echo "Host: ${HOST}"
echo "Port: ${PORT}"
echo "Log Level: ${LOG_LEVEL}"
echo "=========================================="
echo ""
echo "엔드포인트:"
echo "  - http://localhost:8004/health"
echo "  - http://localhost:8004/ready"
echo "  - http://localhost:8004/"
echo "  - http://localhost:8004/route/ecg"
echo "  - http://localhost:8004/route/cxr"
echo "  - http://localhost:8004/route/lab"
echo "  - http://localhost:8004/route/rag"
echo "=========================================="
echo ""

# 실행
python main.py
