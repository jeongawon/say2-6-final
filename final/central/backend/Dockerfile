FROM python:3.12-slim

# LightGBM은 libgomp(OpenMP) 런타임 의존 → slim 이미지엔 없으므로 별도 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# CC map (.parquet) — ML 결정 엔진의 prior 데이터
COPY data/ /app/data/

# RAG ChromaDB는 별도 ECS 서비스 say2-6team-rag-svc로 분리.
# orchestrator는 HTTP POST → http://rag-svc.say2-6team.local:8000/query 호출.
# in-image rag_db/ 357MB 제거 → 이미지 크기 대폭 감량.

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
