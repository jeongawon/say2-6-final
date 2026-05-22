# 응급의료 AI 진단보조 시스템 운영/모니터링 영역 설계 문서

**AWS 아키텍처 운영 옵저버빌리티 가이드 v1.0**
**CloudWatch + SNS 2종 + 앱 푸시 알림 구조**

---

## § 1. 운영/모니터링 자원 구성 개요

```
[감지·기록]        [알람 생성]       [알림 채널]
─────────────────────────────────────────────────────────────────────
CloudWatch          SNS Topic         ① 앱 (WebSocket + Push)
  ├─ Logs            │                 ② Slack (Lambda → Webhook)
  ├─ Metrics         ├─► Lambda  ─►   ③ 이메일 (직접 구독)
  ├─ Alarms          └─► (선택)        ④ SMS (긴급 시)
  └─ Dashboards
```

### 핵심 자원

| 영역 | 서비스 | 역할 |
|---|---|---|
| 로그 수집 | CloudWatch Logs | ECS/HAPI 로그 자동 적재 |
| 메트릭 수집 | CloudWatch Metrics | CPU/메모리/요청수 자동 |
| 알람 발생 | CloudWatch Alarms | 임계값 초과 시 트리거 |
| 시각화 | CloudWatch Dashboards | 실시간 상태판 |
| 메시지 fan-out | SNS Topic | 여러 채널에 동시 발송 |
| 임상 알림 | WebSocket (자체) | 의사/간호사 앱 화면 |
| 운영 알림 | Slack (Lambda 경유) | DevOps/시스템 운영자 |

---

## § 2. 알림이 필요한 2가지 시나리오

우리 시스템에는 **성격이 완전히 다른 2종류 알림**이 있습니다.

### 2.1 임상 알림 (Clinical Alert) — 의사/간호사 대상

```
환자 관련 이벤트 (실시간성·중요도 최상)
─────────────────────────────────────────────────────────────────────
─ 환자 critical 판정 발생
─ 모달 분석 완료 (ECG/CXR/LAB)
─ 종합 소견서 생성 완료 → 서명 대기
─ 4시간 미서명 보고서 escalation

→ 의사·간호사가 앱 화면에서 즉시 봐야 함
→ ★ WebSocket이 이미 우리 시스템에 구현됨
```

### 2.2 운영 알림 (Operational Alert) — DevOps 대상

```
시스템 인프라 이벤트 (모니터링 채널)
─────────────────────────────────────────────────────────────────────
─ Aurora ACU 포화 (DB 부하 한계)
─ ECS Task 다운 (running < desired)
─ Bedrock 호출 실패율 5% 초과
─ HAPI 다운 + fhir_sync_queue 누적
─ CloudTrail 비정상 API 호출

→ 운영자 Slack 채널·이메일로 전달
→ CloudWatch Alarm → SNS → Lambda → Slack Webhook
```

→ **두 채널을 명확히 분리해서 운영**

---

## § 3. CloudWatch — 우리 시스템 사용 서비스

### 3.1 CloudWatch Logs (Day 1 필수)

```
Log Group 구성 (총 6개)
─────────────────────────────────────────────────────────────────────
/ecs/orchestrator       Orchestrator FastAPI 로그
/ecs/ecg-svc            ECG 모달 추론 로그
/ecs/cxr-svc            CXR 모달 추론 로그
/ecs/lab-svc            LAB 모달 추론 로그
/ecs/prognosis-svc      Prognosis 모달 (Phase 2)
/hapi-fhir              HAPI FHIR JVM 로그

Retention 정책:
─ ECS Log Groups: 30일 후 자동 삭제
─ HAPI Log Group: 90일 (FHIR 감사 추적)
─ 30~90일 후 S3 export → Glacier (의료법 5년 보존)

PHI 보호 원칙:
─ ★ 환자 이름·수치·영상·진단 본문 절대 로깅 금지
─ ID(UUID)·카운트·시간·status 메타데이터만 기록
```

### 3.2 CloudWatch Metrics

```
자동 수집되는 메트릭
─────────────────────────────────────────────────────────────────────
ECS:        CPUUtilization, MemoryUtilization, RunningTaskCount
ALB:        RequestCount, TargetResponseTime, HTTPCode_Target_5XX
Aurora:     CPUUtilization, ACUUtilization, DatabaseConnections,
            DeadlockCount
EC2 (HAPI): CPUUtilization, StatusCheckFailed, NetworkIn/Out

커스텀 메트릭 (FastAPI에서 직접 전송)
─────────────────────────────────────────────────────────────────────
EADSS/Orchestrator
  ─ TriageProcessingTime    (트리아지 응답 시간)
  ─ ModalDispatchCount      (모달 호출 횟수)

EADSS/RAG (Phase 2)
  ─ SearchLatencyMs         (ChromaDB 검색 지연)
  ─ AvgSimilarity           (평균 유사도)
  ─ FallbackUsed            (fallback 발동 횟수)

EADSS/FHIRQueue
  ─ PendingCount            (Graceful Queue 적체 수)
  ─ SyncedRate              (분당 동기화 건수)
```

### 3.3 CloudWatch Alarms (Phase 1 핵심 7개)

| 알람 이름 | 조건 | 심각도 | 알림 채널 |
|---|---|---|---|
| triage-latency-high | p95 > 30s (5분) | 긴급 | SNS Critical |
| modal-5xx-errors | 에러율 > 1% (1분) | 긴급 | SNS Critical |
| bedrock-failure | 실패율 > 5% | 긴급 | SNS Critical |
| aurora-acu-saturated | ACU == Max (5분) | 긴급 | SNS Critical |
| ecs-service-down | running < desired | 긴급 | SNS Critical |
| fhir-queue-backlog | pending > 50건 (10분) | 경고 | SNS Warning |
| unsigned-report | 4h 초과 (단계별) | 경고 | SNS Warning |

### 3.4 CloudWatch Logs Insights

```
운영자가 Slack 알람 받은 후 원인 추적용
─────────────────────────────────────────────────────────────────────
[예 1] 지난 1시간 HAPI 큐 적재 추적
fields @timestamp, @message
| filter @message like /enqueuing/
| parse @message /\[queue\] enqueued #\d+ (?<rtype>\w+)\//
| stats count() by rtype

[예 2] 30초 넘게 걸린 트리아지 요청
fields @timestamp, @message
| filter @message like /completed/ and @message like /elapsed/
| parse @message /elapsed=(?<sec>\d+\.\d+)/
| filter sec > 30
| sort sec desc
```

### 3.5 CloudWatch Dashboards

```
1개 통합 대시보드 — "EADSS 실시간 상태판"
─────────────────────────────────────────────────────────────────────
위젯 구성:
─ ECS Service 4개 CPU/메모리/Task 수
─ Aurora ACU 사용량 + DB connections
─ ALB RequestCount + 5xx 에러율
─ Bedrock 호출 성공률
─ FHIR Queue pending 카운트 (실시간)
─ 최근 critical 환자 수

용도: 발표 시연 + 일상 운영 점검
```

### 3.6 CloudWatch Container Insights (Phase 2 추가)

- ECS Task 단위 CPU/메모리/네트워크 메트릭
- OOM Kill 감지 (memory_utilized_percent 100% 도달)
- 비용: ~$4/월 (Task 10개 24h 기준)

---

## § 4. SNS — 알림 발송 허브

### 4.1 SNS Topic 2개

```
[EADSS-Critical-Alert]  긴급 알람 전용
─────────────────────────────────────────────────────────────────────
구독자:
  ─ Lambda (→ Slack #응급 채널)
  ─ Email (당직 운영자)
  ─ SMS (★ 옵션, 중대 사고 시)

연결되는 CloudWatch Alarms:
  ─ triage-latency-high
  ─ modal-5xx-errors
  ─ bedrock-failure
  ─ aurora-acu-saturated
  ─ ecs-service-down

[EADSS-Warning-Alert]  경고 수준
─────────────────────────────────────────────────────────────────────
구독자:
  ─ Lambda (→ Slack #운영 채널)

연결되는 CloudWatch Alarms:
  ─ fhir-queue-backlog
  ─ unsigned-report (단계별 escalation)
```

### 4.2 SNS → Slack 변환 Lambda (10줄)

```python
import json, urllib.request, os

def handler(event, context):
    msg = event['Records'][0]['Sns']['Message']
    subject = event['Records'][0]['Sns']['Subject']
    body = json.dumps({
        "text": f":rotating_light: *{subject}*\n```{msg}```"
    }).encode()
    urllib.request.urlopen(os.environ['SLACK_WEBHOOK_URL'], data=body)
    return {'statusCode': 200}
```

설정:
- Slack Incoming Webhook URL은 Parameter Store에 저장
- Lambda 환경변수에서 호출 (코드에 흔적 0)
- 비용: 사실상 무료 (월 100건 가정 시 $0)

### 4.3 비용

- SNS Topic 2개: ~$0.5/월
- 메시지 발송 (월 1만건): ~$0.5/월
- Lambda 호출 (월 100건): ~$0
- **합계: 월 ~$1**

---

## § 5. 앱 알림 구조 — 임상 시나리오

> 의사·간호사가 사용하는 React/Vite 웹앱에 어떻게 알림을 띄울 것인가

### 5.1 알림 방식 3가지 (계층화)

```
[Layer 1] 인앱 알림 — 의사가 앱 열고 있을 때
─────────────────────────────────────────────────────────────────────
WebSocket (이미 구현됨!)
  ─ broadcast() 호출 → 모든 연결된 클라이언트에 push
  ─ React에서 useEffect로 메시지 수신 → 토스트/배지 표시
  ─ 즉시성: 100ms 이내

[Layer 2] 브라우저 푸시 — 탭이 닫혀 있어도
─────────────────────────────────────────────────────────────────────
Browser Push API + Service Worker
  ─ 사용자 동의 후 토큰 발급 → 운영 DB 저장
  ─ Critical 이벤트 발생 시 백엔드가 푸시 전송
  ─ 브라우저 닫혀있어도 OS 알림센터에 표시

[Layer 3] 외부 채널 — 의사가 자리에 없을 때
─────────────────────────────────────────────────────────────────────
SMS / 이메일 (SNS 경유)
  ─ 4시간 미서명 보고서 escalation
  ─ critical 판정 + 5분 무응답 시 자동 발송
```

### 5.2 WebSocket — 이미 구현된 임상 알림 채널

```
백엔드 동작 흐름
─────────────────────────────────────────────────────────────────────
ECG 모달 완료
   ↓
Orchestrator: broadcast(encounter_id, {
  "event": "modal_completed",
  "modality": "ECG",
  "risk_level": "urgent"
})
   ↓
WebSocket 서버 (FastAPI)
   ↓
[연결된 모든 클라이언트]
   ├─ 의사 A의 브라우저 (Encounter 화면)
   ├─ 간호사 B의 브라우저 (Dashboard)
   └─ Triage Station 모니터
```

```
프론트 React 처리 예시
─────────────────────────────────────────────────────────────────────
useEffect(() => {
  const ws = new WebSocket('wss://eadss.example.com/ws')
  
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    
    if (msg.event === 'modal_completed') {
      toast.success(`${msg.modality} 분석 완료`)
      refetchModalResults(msg.encounter_id)
    }
    
    if (msg.risk_level === 'critical') {
      // 빨간 배너 + 알림 사운드
      showCriticalBanner(msg.encounter_id)
      playAlarmSound()
    }
  }
}, [])
```

### 5.3 Browser Push API — 탭 닫혀있어도 알림

```
구현 단계
─────────────────────────────────────────────────────────────────────
1. 사용자 동의 받기
   Notification.requestPermission()

2. Service Worker 등록 + 푸시 구독
   const sub = await registration.pushManager.subscribe({
     userVisibleOnly: true,
     applicationServerKey: VAPID_PUBLIC_KEY,
   })

3. 구독 정보(endpoint + keys) 운영 DB에 저장
   POST /users/me/push-subscription

4. 백엔드에서 critical 발생 시 푸시 전송
   pywebpush.webpush(
     subscription_info=sub,
     data=json.dumps({"title": "Critical Patient", "body": "..."})
   )

5. Service Worker가 받아서 OS 알림 표시
   self.addEventListener('push', (e) => {
     self.registration.showNotification(title, { body, icon, badge })
   })
```

비용: $0 (브라우저 푸시는 무료)

### 5.4 모바일 푸시 (Phase 2 옵션)

```
의사용 모바일 앱이 생기면 SNS Mobile Push 활용
─────────────────────────────────────────────────────────────────────
─ iOS:    APNs (Apple Push Notification service)
─ Android: FCM (Firebase Cloud Messaging)
─ SNS Topic이 자동으로 두 플랫폼에 fan-out

흐름:
  앱 설치 → device token 등록 → SNS Endpoint 생성
       ↓
  Critical 이벤트 발생 → SNS Publish → APNs/FCM → 폰
```

### 5.5 알림 우선순위 매트릭스

| 이벤트 | WebSocket | Browser Push | Slack | SMS |
|---|---|---|---|---|
| 모달 분석 완료 | ✅ | — | — | — |
| 종합 소견서 생성 | ✅ | ✅ | — | — |
| **Critical 환자** | ✅ | ✅ | ✅ #응급 | ✅ |
| 4h 미서명 보고서 | ✅ | ✅ | ✅ #응급 | ✅ |
| Aurora ACU 포화 | — | — | ✅ #운영 | — |
| HAPI 큐 누적 | — | — | ✅ #운영 | — |
| ECS Task 다운 | — | — | ✅ #응급 | — |

→ **임상은 WebSocket+Push 우선, 운영은 Slack 우선**

---

## § 6. 통합 알림 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│ 임상 알림 흐름 (Critical 환자 발견 시)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ECG 모달 → risk_level=critical 응답                               │
│    ↓                                                              │
│ Orchestrator                                                      │
│    ├─► WebSocket broadcast() ──► 의사 앱 즉시 표시 ✓              │
│    ├─► Browser Push API     ──► 탭 닫혀있어도 OS 알림 ✓           │
│    ├─► modal_events INSERT  ──► DB 영구 보관                     │
│    └─► (5분 무응답 시) SNS Critical ──► Slack + SMS              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 운영 알림 흐름 (Aurora ACU 포화)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Aurora 메트릭 (ACUUtilization == 100%)                           │
│    ↓                                                              │
│ CloudWatch Alarm "aurora-acu-saturated"                          │
│    ↓ Action                                                       │
│ SNS Topic "EADSS-Critical-Alert"                                 │
│    ├─► Lambda → Slack #응급 채널 "@here ACU 포화" 메시지          │
│    └─► Email → 당직 운영자                                        │
│                                                                  │
│ 운영자 → CloudWatch Dashboard 확인 → MaxCapacity 임시 상향        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## § 7. Phase 1 운영/모니터링 비용

| 항목 | Phase 1 | 비고 |
|---|---|---|
| CloudWatch Logs | ~$5 | 10GB ingestion |
| CloudWatch Metrics | ~$3 | 커스텀 메트릭 ~10종 |
| CloudWatch Alarms | ~$2 | 알람 7개 |
| CloudWatch Dashboards | $0 | 3개까지 무료 |
| SNS Topic + 발송 | ~$1 | 2 Topic, 월 1만건 |
| Lambda (Slack 변환) | $0 | 월 100건 사실상 무료 |
| Browser Push | $0 | 브라우저 무료 |
| **합계** | **~$11/월** | |

### Phase 2 추가

| 항목 | 비용 |
|---|---|
| Container Insights | +$4 |
| X-Ray | +$5 |
| RAG 품질 메트릭 4종 | +$2 |
| SMS (월 100건) | +$3 |
| **Phase 2 추가 합계** | **+$14/월** |

---

## § 8. 강사님 의견에 대한 정확한 답변

> **"CloudWatch 하나로 모든 이벤트·로그를 볼 수 있다"**

**부분적으로 맞음, 정확한 답변**:

- ✅ CloudWatch가 **모니터링의 우산** (Logs + Metrics + Alarms + Dashboards)
- ✅ 로그·메트릭 **수집과 조회**는 CloudWatch 단독 가능
- ⚠️ 하지만 **Slack/이메일/SMS로 알림을 보내려면 SNS가 반드시 필요**
- ⚠️ 앱 화면에 실시간 알림은 **WebSocket(자체 구현)** 또는 **Browser Push**가 필요

→ 우리 시스템 = **CloudWatch (감지) + SNS (운영 알림) + WebSocket (임상 알림)** 3축 구조

---

## § 9. 운영/모니터링 영역 설계 7대 원칙

1. **2채널 분리** — 임상 알림(WebSocket) vs 운영 알림(SNS+Slack)
2. **PHI Zero 로깅** — 로그는 ID·메타데이터만, 환자 정보 절대 금지
3. **계층화된 알림** — WebSocket(인앱) → Push(탭 닫혀도) → Slack/SMS(자리 비움)
4. **Critical 알람은 다중 채널** — Slack + 이메일 + (옵션) SMS 동시
5. **CloudWatch가 우산** — 단, 발송은 SNS 거쳐야 함
6. **Dashboards 1개 통합** — 발표·운영 점검용
7. **점진 도입** — Container Insights, X-Ray는 Phase 2

---

## § 10. Phase별 도입 로드맵

### Phase 1 (MVP / 데모)

```
☑ CloudWatch Logs (ECS + HAPI awslogs 드라이버)
☑ CloudWatch Metrics (기본 자동 + 커스텀 3종)
☑ CloudWatch Alarms 7개
☑ CloudWatch Dashboard 1개 (통합 상태판)
☑ SNS Topic 2개 (Critical + Warning)
☑ Lambda → Slack Webhook 1개
☑ WebSocket broadcast() (이미 구현)
☑ CloudTrail (감사 — Day 1 무조건)
```

### Phase 2 (운영 진입 시 추가)

```
+ Container Insights (Task 단위 OOM 추적)
+ X-Ray 분산 추적 (5+ 서비스 체인 디버깅)
+ Browser Push Notification (탭 닫혀도 알림)
+ SMS 채널 (의사 직접 호출)
+ EventBridge (복잡한 이벤트 라우팅 시)
+ GuardDuty (보안 위협 자동 탐지)
+ RAG 품질 메트릭 4종
```

### Phase 3 (멀티 병원)

```
+ Mobile Push (SNS + APNs/FCM)
+ AWS Chatbot (Slack 양방향 통합 - ack/mute UX)
+ CloudWatch Synthetics (외부 URL Canary 모니터링)
+ AWS Health Dashboard 자동 연동 (AWS 측 장애 즉시 인지)
```

---

*문서 끝*
