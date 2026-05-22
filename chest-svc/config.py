"""
chest-svc-v2 설정 — 순수 이미지 분석 엔진.
RAG/Bedrock 관련 설정 전부 제거. MODEL_DIR + LOG_LEVEL + PORT만.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_dir: str = "/models"      # K8s subPath 마���트 경로 통일
    log_level: str = "INFO"
    port: int = 8002

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
