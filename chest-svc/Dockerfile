# chest-svc-pre — Multi-stage: React frontend + FastAPI backend
# 단독 빌드: docker build -t chest-svc-pre .

# === Stage 1: Frontend Build ===
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build --base /static/

# === Stage 2: Backend + Built Frontend ===
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends libgomp1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Python 소스
COPY main.py config.py pipeline.py thresholds.py ./
COPY shared/ ./shared/
COPY layer1_segmentation/ ./layer1_segmentation/
COPY layer2_classification/ ./layer2_classification/
COPY layer3_clinical_logic/ ./layer3_clinical_logic/

# ONNX 모델 (UNet 84MB + DenseNet 28MB = 113MB)
COPY models/ /models/

# 테스트 이미지
COPY test-images/ ./test-images/

# 빌드된 프론트엔드 → /app/static (main.py가 자동 서빙)
COPY --from=frontend /frontend/dist ./static/

ENV MODEL_DIR=/models
ENV LOG_LEVEL=INFO

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/healthz')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
