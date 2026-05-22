# data-rag-stack 핸드오프

> 배포 스택: `say2-6team-data-rag`  
> 리전: `ap-northeast-2`  
> 담당: yji  
> 배포 상태: ✅ 부분 배포 완료 (S3 + ECR + Cloud Map)  
> 미완료: ECS Task/Service (Cluster ARN + Docker 이미지 필요)

---

## 배포된 Export

| Export 이름 | 실제 값 |
|---|---|
| `say2-6team-rag-db-bucket` | `say2-6team-rag-db-666803869796` |
| `say2-6team-rag-ecr-uri` | `666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-rag-api` |

---

## lji (컴퓨팅) — 오케스트레이터에서 RAG 호출 방법

### 호출 주소

```
rag-svc.say2-6team.local:8000
```

Cloud Map에 등록됨. 오케스트레이터에서 이 DNS로 HTTP 요청하면 됨.

### API 스펙

```
POST http://rag-svc.say2-6team.local:8000/query

Request Body:
{
  "query": "CXR: Consolidation in RLL. WBC 18500. ECG: Sinus Tachycardia 110bpm."
}

Response:
{
  "results": [
    {
      "id": "12345_discharge",
      "document": "...",
      "metadata": {"chunk_type": "discharge_summary", "hadm_id": "12345"},
      "similarity": 0.86
    }
  ],
  "fallback": false
}
```

### 오케스트레이터 환경변수

```yaml
Environment:
  - Name: RAG_SERVICE_URL
    Value: http://rag-svc.say2-6team.local:8000
```

### 필요한 것 (lji → yji)

| 필요한 것 | 용도 |
|-----------|------|
| **ECS Cluster ARN** | RAG Service를 같은 클러스터에 배포 |

Export 이름 권장: `say2-6team-ecs-cluster-arn`

---

## hkt (DB) — 관련 없음

RAG DB는 S3에 저장되며 Aurora/HAPI와 무관합니다. data-stack에서 참조할 것 없음.

---

## 현재 구조

```
[Orchestrator]
  → HTTP POST → rag-svc.say2-6team.local:8000/query
  → [RAG API Container (Fargate)]
      → 부팅 시: S3에서 ChromaDB 파일 다운로드 (372MB)
      → 쿼리: Bedrock Titan Embed → ChromaDB 검색 → Top-K 반환
```

- ChromaDB는 별도 서버 없음 (컨테이너 내부 파일 모드)
- 읽기 전용 (운영 중 DB 변경 없음)
- DB 업데이트: 6개월 주기, 로컬에서 재생성 → S3 재업로드 → Task 재시작

---

## 남은 작업

| # | 작업 | 상태 |
|:-:|------|:----:|
| 1 | Docker 이미지 빌드 + ECR Push | ⏳ |
| 2 | lji에게 Cluster ARN 받기 | ⏳ |
| 3 | update-stack (파라미터 채우기) | ⏳ |
| 4 | RAG API 동작 테스트 | ⏳ |

---

## S3 RAG DB 경로

```
s3://say2-6team-rag-db-666803869796/local_rag_db/
├── chroma.sqlite3
├── README.md
└── 44dffb64-d504-453a-8e7b-3591d9f8933c/
    ├── data_level0.bin
    ├── header.bin
    ├── index_metadata.pickle
    ├── length.bin
    └── link_lists.bin
```

- 총 49,743건 (discharge 9,998 + radiology 39,745)
- 벡터 차원: 512 (Titan Embed v2)
- 용량: ~372MB
