"""
Router Service 환경 설정
"""

import os

# 서버 설정
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8004"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# 모달 서비스 URL (Cloud Map DNS)
ECG_SVC_URL = os.getenv("ECG_SVC_URL", "http://ecg-svc.say2-6team.local:8001")
CXR_SVC_URL = os.getenv("CXR_SVC_URL", "http://cxr-svc.say2-6team.local:8002")
LAB_SVC_URL = os.getenv("LAB_SVC_URL", "http://lab-svc.say2-6team.local:8003")
RAG_SVC_URL = os.getenv("RAG_SVC_URL", "http://rag-svc.say2-6team.local:8000")

# 타임아웃 설정 (초)
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "300"))

# AWS / Bedrock (RAG 장애 시 직접 호출 폴백)
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-4-6")
