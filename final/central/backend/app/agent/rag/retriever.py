"""
RAG Retriever — rag-svc(별도 ECS 서비스) HTTP API 호출.

[배경]
기존엔 orchestrator 컨테이너 안에 chromadb를 직접 import하고 /app/rag_db/chroma.sqlite3를
in-process로 조회했음. 팀원이 RAG를 별도 ECS 서비스(say2-6team-rag-svc)로 분리하면서
orchestrator는 HTTP 호출로 이관.

   orchestrator → POST /query → rag-svc → 내부 chromadb → S3에서 받은 chroma.sqlite3
                                            ↑ S3 download + chromadb 책임은 rag-svc로

[엔드포인트]
- ECS production: http://rag-svc.say2-6team.local:8000 (Cloud Map private DNS)
- 로컬 dev: 환경변수 RAG_API_BASE 미설정 시 자동 fallback (검색 결과 0건 반환)

[graceful degradation]
- HTTP 5xx / timeout / 네트워크 단절 → 빈 결과 + fallback=True
- 호출부(report_generator)는 RAG 없이도 일반 임상 지식만으로 소견서 생성 진행
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# rag-svc 엔드포인트. ECS Task Definition env로 주입.
RAG_API_BASE = os.getenv("RAG_API_BASE", "http://rag-svc.say2-6team.local:8000")
RAG_TIMEOUT_SEC = float(os.getenv("RAG_TIMEOUT_SEC", "5"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K_FINAL", "3"))

FALLBACK_RESPONSE = (
    "유사한 과거 환자 사례를 찾지 못했습니다. 추가 검사가 필요합니다."
)


class Retriever:
    """rag-svc HTTP 클라이언트. 인터페이스는 기존 in-process 버전과 동일.

    사용:
        retriever = Retriever()
        result = await retriever.search("34세 남성 흉통")
        # → {"results": [{...}, ...], "fallback": False}
    """

    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=RAG_API_BASE,
            timeout=RAG_TIMEOUT_SEC,
        )
        logger.info("[rag] HTTP Retriever ready: base=%s timeout=%ss", RAG_API_BASE, RAG_TIMEOUT_SEC)

    async def search(self, query: str) -> dict[str, Any]:
        """rag-svc /query 호출 → report_generator가 기대하는 형식으로 정규화.

        report_generator는 다음 형태를 기대:
            {
              "results": [
                {"id": ..., "document": ..., "metadata": {"chunk_type", "hadm_id"}, "similarity": ...},
                ...
              ],
              "fallback": bool
            }
        """
        try:
            resp = await self._client.post(
                "/query",
                json={"query": query, "top_k": RAG_TOP_K},
            )
            resp.raise_for_status()
            data = resp.json()

            # rag-svc 응답 형태에 맞춰 정규화.
            # ⚠️ 팀원 API 응답 키 이름이 다르면 아래 매핑만 조정하면 됨.
            raw_results = data.get("results") or data.get("hits") or []
            results: list[dict[str, Any]] = []
            for r in raw_results:
                results.append({
                    "id": r.get("id") or r.get("hadm_id") or "",
                    "document": r.get("document") or r.get("text") or "",
                    "metadata": {
                        "chunk_type": (r.get("metadata") or {}).get("chunk_type")
                                       or r.get("chunk_type") or "unknown",
                        "hadm_id": (r.get("metadata") or {}).get("hadm_id")
                                    or r.get("hadm_id") or "?",
                    },
                    "similarity": r.get("similarity") or r.get("score") or 0,
                })

            logger.info("[rag] HTTP search hit %d results (query_len=%d)", len(results), len(query))
            return {"results": results, "fallback": not results}

        except httpx.TimeoutException:
            logger.warning("[rag] timeout — fallback (base=%s)", RAG_API_BASE)
            return {"results": [], "fallback": True}
        except httpx.HTTPStatusError as e:
            logger.warning("[rag] HTTP %d — fallback: %s", e.response.status_code, e.response.text[:200])
            return {"results": [], "fallback": True}
        except Exception as e:
            logger.warning("[rag] 호출 실패 — fallback: %s: %s", type(e).__name__, e)
            return {"results": [], "fallback": True}

    async def aclose(self) -> None:
        """앱 shutdown 시 호출 — HTTP 클라이언트 cleanup."""
        await self._client.aclose()
