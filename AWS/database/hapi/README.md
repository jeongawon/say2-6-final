# HAPI FHIR DB 초기화 스택

## 개요

Aurora Serverless v2 클러스터 내에 HAPI FHIR 전용 데이터베이스와 사용자를 생성하는 CloudFormation 스택입니다.

master credential(`admin`/`central_db`)과 완전히 분리된 credential을 사용하여, HAPI 서버가 탈취되더라도 운영 DB(`central_db`)에 접근할 수 없도록 보안을 강화합니다.

---

## 아키텍처

```
say2-6team-aurora-cluster (PostgreSQL 16, Serverless v2)
├── central_db  →  사용자: admin (master)  →  시크릿: say2-6team/aurora-credentials
└── hapi        →  사용자: hapi_user       →  시크릿: say2-6team/hapi-credentials
```

---

## 스택이 생성하는 리소스

| 리소스 | 설명 |
|--------|------|
| **Secrets Manager Secret** | `say2-6team/hapi-credentials` — 비밀번호 자동 생성 (32자, 특수문자 제외) |
| **IAM Role** | Lambda 실행 역할 (RDS Data API + Secrets Manager + KMS 접근) |
| **Lambda Function** | DB/User 생성 로직 실행 (Python 3.12) |
| **Custom Resource** | 스택 배포 시 Lambda 자동 트리거 |

---

## Lambda가 실행하는 SQL

```sql
-- 1. HAPI 전용 사용자 생성
CREATE ROLE hapi_user WITH LOGIN PASSWORD '<자동생성_32자>';

-- 2. HAPI 전용 DB 생성 (owner 지정)
CREATE DATABASE hapi OWNER hapi_user;

-- 3. 권한 부여
GRANT ALL PRIVILEGES ON DATABASE hapi TO hapi_user;

-- 4. public 스키마 권한 (hapi DB 접속 후)
GRANT ALL ON SCHEMA public TO hapi_user;

-- 5. 스키마 소유권 이전 (HAPI JPA 자동 DDL용)
ALTER SCHEMA public OWNER TO hapi_user;
```

---

## 의존 스택

| 스택 | Export | 용도 |
|------|--------|------|
| aurora-stack | `say2-6team-aurora-cluster-arn` | RDS Data API 대상 |
| aurora-stack | `say2-6team-aurora-secret-arn` | master credential로 DB 생성 |
| aurora-stack | `say2-6team-aurora-endpoint` | 시크릿에 host 정보 저장 |
| aurora-stack | `say2-6team-aurora-kms-arn` | 시크릿 복호화 |

---

## 배포 방법

### 사전 조건
- aurora-stack이 배포되어 있어야 함 (`CREATE_COMPLETE` 상태)
- AWS CLI 설정 완료 (`aws configure`)

### 배포 명령어

```bash
aws cloudformation create-stack \
  --stack-name say2-6team-hapi-db \
  --template-body file://AWS/hapi-db/hapi-db-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2 \
  --tags Key=project,Value=pre-say2-6team
```

### 배포 확인

```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-hapi-db \
  --region ap-northeast-2 \
  --query 'Stacks[0].StackStatus'
```

---

## Outputs

| Output | 값 | Export Name |
|--------|-----|------------|
| HapiSecretArn | 시크릿 ARN | `say2-6team-hapi-secret-arn` |
| HapiDbName | `hapi` | — |
| HapiUsername | `hapi_user` | — |

---

## 시크릿 구조 (`say2-6team/hapi-credentials`)

```json
{
  "username": "hapi_user",
  "password": "<자동생성_32자>",
  "dbname": "hapi",
  "host": "say2-6team-aurora-cluster.cluster-xxxxx.ap-northeast-2.rds.amazonaws.com",
  "port": "5432"
}
```

---

## 컴퓨팅 담당에게 전달할 정보

1. **시크릿 이름**: `say2-6team/hapi-credentials`
2. **시크릿 ARN**: `arn:aws:secretsmanager:ap-northeast-2:666803869796:secret:say2-6team/hapi-credentials-GAZYtF`
3. **Export Name**: `say2-6team-hapi-secret-arn` (CloudFormation ImportValue로 참조 가능)

컴퓨팅 담당은 HAPI EC2의 IAM Role에 이 시크릿에 대한 `secretsmanager:GetSecretValue` 권한을 부여하고, user-data에서 시크릿을 읽어 HAPI 서버 DB 접속 설정에 사용합니다.

---

## 보안 설계

- master(`admin`)와 `hapi_user` credential 완전 분리
- 비밀번호는 Secrets Manager가 자동 생성 (코드에 하드코딩 없음)
- KMS 암호화 적용 (Aurora 스택의 KMS 키 사용)
- HAPI 서버는 `hapi` DB만 접근 가능, `central_db` 접근 불가
- Security Group 규칙은 security-stack에서 관리 (`AuroraIngressFromHAPI` 이미 정의됨)

---

## HAPI 서버 기동 후 동작

HAPI FHIR 서버는 JPA/Hibernate 기반으로, 첫 기동 시 `hapi` DB에 자동으로 스키마(테이블 200개+)를 생성합니다. 별도 DDL 실행 불필요.

```yaml
# HAPI 서버 설정 (docker-compose 환경변수)
SPRING_DATASOURCE_URL: jdbc:postgresql://<host>:5432/hapi
SPRING_DATASOURCE_USERNAME: hapi_user
SPRING_DATASOURCE_PASSWORD: <시크릿에서 읽은 값>
```

---

## 문서 버전

- **v1.0** / 2026-05-19
- **작성자**: DB 담당 (hkt)
- **프로젝트**: say2-6team
