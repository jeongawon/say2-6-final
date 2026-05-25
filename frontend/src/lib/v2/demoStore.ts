// say-6 v2 — 데모 환자 데이터 (in-memory)
// 트리아지 큐 = 레거시 EMR과 동일한 데이터셋:
//   · DEMO_CASES_4    — MIMIC 식별자가 붙은 핵심 시연 4케이스 (백엔드 실판독)
//   · DEMO_PATIENTS_50 — Synthea 합성 데모 환자 50명
// SHOWCASE_PATIENTS(042 등)는 브랜드 페이지 딥링크 전용으로만 유지.

import type { PatientCardData } from "../../components/v2/PatientCard";
import type { AIRecommendation } from "../../components/v2/AIRecommendationPanel";
import type { Vitals, QueuePatient, PastHistoryCode, ChiefComplaint } from "../../types/triage";
import { CHIEF_COMPLAINT_LABELS } from "../../types/triage";
import { DEMO_CASES_4 } from "../../data/triage_demo_cases_4";
import { DEMO_PATIENTS_50 } from "../../data/triage_demo_50";

export interface DemoPatient extends PatientCardData {
  vitals: Vitals;
  arrivedAt: string;
  recommendation?: AIRecommendation;
  // 의무기록번호 (등록번호) — 화면 표시용. id(=encounter_id UUID)와 별개.
  mrn?: string;
  // 백엔드 FHIR Patient id — 의사 직접 오더(/orders/request) 호출용
  fhirPatientId?: string;
  // 트리아지 폼 자동 채움용 (레거시 큐 데이터에서 옴)
  pastHistory?: PastHistoryCode[];
  allergies?: string;
  medications?: string;
  notes?: string; // 트리아지 메모 / 특이사항
  // 데모 케이스의 MIMIC 원본 식별자 — 백엔드 모달 호출용 (submitTriage의 mimic 필드)
  mimic?: { subject_id?: string; cxr_image_path?: string; ecg_record_path?: string } | null;
  // 영문 주호소 코드 — 백엔드 CC Map(영문 MIMIC) 라우팅용. chief(한국어)와 별개로 보존.
  chiefCode?: ChiefComplaint;
}

function nowMinus(min: number): string {
  return new Date(Date.now() - min * 60000).toISOString();
}

// 브랜드 페이지(/demo/patient/042 등) 딥링크 전용 쇼케이스 환자.
// recommendation 데이터가 미리 채워져 있어 백엔드 없이도 소견서 데모가 됨.
const SHOWCASE_PATIENTS: DemoPatient[] = [
  {
    id: "042",
    name: "김재현",
    age: 52,
    sex: "M",
    ktas: 2,
    chief: "흉통, 호흡곤란 30분 전 발생",
    registeredAt: nowMinus(12),
    arrivedAt: nowMinus(12),
    ecg: "done", cxr: "done", lab: "done",
    aiStatus: "done",
    aiVerdict: { risk: "critical", summary: "STEMI 의심 (anterior wall). 즉시 PCI 권고." },
    vitals: { sbp: 140, dbp: 90, hr: 88, rr: 22, spo2: 94, bt: 36.8 },
    recommendation: {
      risk: "critical",
      diagnosis: "STEMI (anterior wall) 의심",
      reasons: [
        "ECG: V2-V4 ST 상승 (전벽 패턴)",
        "LAB: Troponin 0.8 ng/mL ↑↑ (정상 < 0.04)",
        "CXR: 폐 침윤 없음, 심비대 경미",
      ],
      confidence: 0.92,
      recommendations: [
        "Aspirin 300mg PO STAT",
        "Heparin IV bolus 5000U",
        "심혈관조영술 즉시 (Cath Lab 대기)",
        "순환기내과 컨설트",
      ],
      similarCases: [
        { id: "A-001", similarity: 0.89 },
        { id: "A-105", similarity: 0.84 },
        { id: "A-200", similarity: 0.78 },
      ],
    },
  },
  {
    id: "041",
    name: "이수진",
    age: 34,
    sex: "F",
    ktas: 3,
    chief: "급성 복통, 우하복부",
    registeredAt: nowMinus(16),
    arrivedAt: nowMinus(16),
    ecg: "running", cxr: "running", lab: "done",
    aiStatus: "analyzing",
    vitals: { sbp: 118, dbp: 76, hr: 96, rr: 18, spo2: 98, bt: 37.6 },
  },
  {
    id: "040",
    name: "박준영",
    age: 67,
    sex: "M",
    ktas: 4,
    chief: "기침 2주, 발열",
    registeredAt: nowMinus(29),
    arrivedAt: nowMinus(29),
    ecg: "done", cxr: "done", lab: "done",
    aiStatus: "done",
    aiVerdict: { risk: "normal", summary: "CXR 정상, ECG 정상. 단순 상기도 감염 가능성." },
    vitals: { sbp: 132, dbp: 82, hr: 78, rr: 16, spo2: 97, bt: 37.4 },
    recommendation: {
      risk: "normal",
      diagnosis: "급성 상기도 감염 (URI) 의심",
      reasons: [
        "CXR: 폐 음영 정상",
        "ECG: 정상 동조율 78bpm",
        "LAB: WBC 8.2 (정상), CRP 0.8 (경미 상승)",
      ],
      confidence: 0.87,
      recommendations: [
        "대증치료: Acetaminophen 500mg q6h",
        "수분 섭취 권장",
        "48시간 경과 후 호전 없으면 재내원",
      ],
      similarCases: [
        { id: "B-410", similarity: 0.81 },
        { id: "B-512", similarity: 0.76 },
      ],
    },
  },
  {
    id: "039",
    name: "정은지",
    age: 28,
    sex: "F",
    ktas: 4,
    chief: "긴장성 두통",
    registeredAt: nowMinus(42),
    arrivedAt: nowMinus(42),
    ecg: "done", cxr: "done", lab: "done",
    aiStatus: "done",
    aiVerdict: { risk: "normal", summary: "활력징후 정상. 긴장성 두통 추정." },
    vitals: { sbp: 110, dbp: 70, hr: 72, rr: 14, spo2: 99, bt: 36.5 },
    awaitingSign: true,
    recommendation: {
      risk: "normal",
      diagnosis: "긴장성 두통 (Tension-type headache)",
      reasons: [
        "활력징후 모두 정상범위",
        "ECG 정상",
        "신경학적 결손 없음",
      ],
      confidence: 0.94,
      recommendations: [
        "NSAIDs (Ibuprofen 400mg)",
        "스트레스 관리 권고",
        "지속 시 신경과 외래",
      ],
      similarCases: [{ id: "C-201", similarity: 0.88 }],
    },
  },
  {
    id: "038",
    name: "최성훈",
    age: 45,
    sex: "M",
    ktas: 5,
    chief: "단순 찰과상",
    registeredAt: nowMinus(55),
    arrivedAt: nowMinus(55),
    ecg: "done", cxr: "done", lab: "done",
    aiStatus: "done",
    aiVerdict: { risk: "normal", summary: "외상 경미, 봉합 불필요." },
    vitals: { sbp: 122, dbp: 78, hr: 70, rr: 14, spo2: 99, bt: 36.6 },
  },
];

// ── 레거시 큐 데이터(QueuePatient) → v2 DemoPatient 변환 ──
function fromQueuePatient(
  p: QueuePatient,
  mimic?: DemoPatient["mimic"],
): DemoPatient {
  return {
    id: p.id,
    mrn: p.mrn,
    name: p.name,
    age: p.age,
    sex: p.sex,
    ktas: p.ktas,
    chief: p.complaint_detail || CHIEF_COMPLAINT_LABELS[p.chief_complaint]?.ko || "기타",
    chiefCode: p.chief_complaint,
    registeredAt: p.registered_at,
    arrivedAt: p.arrived_at,
    ecg: "pending", cxr: "pending", lab: "pending",
    aiStatus: "pending",
    vitals: p.vitals,
    pastHistory: p.past_history,
    allergies: p.allergies,
    medications: p.medications,
    notes: p.notes,
    mimic: mimic ?? null,
  };
}

// 시연 4케이스 — AI 종합소견 데이터 (subject_id 기준)
const CASE_RECOMMENDATIONS: Record<string, AIRecommendation> = {
  // Case 1 — 신규 발현 심방세동
  "19041043": {
    risk: "urgent",
    diagnosis: "신규 발현 심방세동 (Atrial Fibrillation, NEW)",
    confidence: 0.61,
    reasons: [
      "ECG: 심방세동/조동 패턴 감지 (신뢰도 61%) — 심박수 114회/분 빈맥 + 불규칙 리듬",
      "CXR: 심비대·폐부종 소견 없음, 폐야 깨끗 — 구조적 심질환 동반 소견 없음",
      "발병 약 90분 — 48시간 이내 율동전환 가능 시점",
      "혈역학 안정 (SBP 129 mmHg, SpO₂ 100%, GCS 15)",
    ],
    recommendations: [
      "12유도 심전도 즉시 재시행 및 판독의 직접 확인 (심방세동/조동 감별, ST 변화·WPW 동반 여부)",
      "혈액검사 시행 — CBC, BMP(K⁺, Mg²⁺), Troponin I/T, TSH, PT/INR, BNP/NT-proBNP, 혈당",
      "흉부 X선 시행 — 심비대, 폐부종, 폐렴 등 유발·동반 질환 평가",
      "심박수 조절 — Metoprolol IV 또는 Diltiazem IV (담당 의사 판단)",
      "항응고 치료 필요성 평가 — CHA₂DS₂-VASc 점수 산정 후 NOAC/헤파린 시작 고려",
      "심초음파 시행 고려 — 구조적 심질환 평가, 율동전환 전 좌심방 혈전 배제(필요 시 TEE)",
      "지속 심전도 모니터링 및 활력징후 15분 간격 측정",
    ],
    similarCases: [
      { id: "A-1042", similarity: 0.71 },
      { id: "A-0915", similarity: 0.66 },
      { id: "A-1180", similarity: 0.60 },
    ],
  },
  // Case 2 — 만성 이완성 심부전 급성 악화
  "13715870": {
    risk: "critical",
    diagnosis: "만성 이완성 심부전 급성 악화 (ADHF)",
    confidence: 0.88,
    reasons: [
      "LAB: NT-proBNP 12,462 pg/mL — 정상치 약 20배",
      "CXR: 폐부종·심비대 소견",
      "호흡수 34회/분 빈호흡 + SpO₂ 89% 저산소혈증",
      "야간 좌위호흡 — 좌심부전 전형 증상",
      "기저질환: CABG·판막치환술, 심방세동, 고혈압",
    ],
    recommendations: [
      "산소 공급 — SpO₂ ≥ 94% 목표, 필요 시 비침습 환기(NIV)",
      "이뇨제 정주 — Furosemide IV로 체액 과부하 교정",
      "흉부 X선·심초음파 — 좌심실 기능·판막 상태 평가",
      "Troponin·심전도 — 동반 허혈성 심질환 배제",
      "수액·염분 제한, 활력징후·소변량 모니터링",
      "순환기내과 협진 — 입원 치료 고려",
    ],
    similarCases: [
      { id: "B-2210", similarity: 0.84 },
      { id: "B-1903", similarity: 0.79 },
      { id: "B-2055", similarity: 0.74 },
    ],
  },
  // Case 3 — 중증 고칼륨혈증 + 말기 신부전
  "15638163": {
    risk: "critical",
    diagnosis: "중증 고칼륨혈증 + 말기 신부전 (ESRD)",
    confidence: 0.90,
    reasons: [
      "LAB: 혈청 칼륨 6.6 mEq/L — 중증 고칼륨혈증",
      "LAB: BUN 172 mg/dL — 말기 신부전 악화",
      "투석 1회 미시행 — 체액·전해질 축적",
      "ECG: 고칼륨혈증 변화 패턴 감지 (35.3%)",
      "혈압 158/95 mmHg — 고혈압 동반",
    ],
    recommendations: [
      "고칼륨혈증 응급 처치 — Calcium gluconate IV, 인슐린+포도당, 베타작용제 흡입",
      "심전도 지속 모니터링 — 부정맥·QRS 확장 감시",
      "응급 혈액투석 — 신장내과 즉시 협진",
      "칼륨 추적 검사 — 1~2시간 간격 재측정",
      "칼륨 함유 수액·약물 중단",
      "활력징후 15분 간격, 소변량 측정",
    ],
    similarCases: [
      { id: "C-3301", similarity: 0.91 },
      { id: "C-2870", similarity: 0.85 },
      { id: "C-3115", similarity: 0.80 },
    ],
  },
  // Case 4 — NSTEMI 의심 + 급성 심부전 + ESRD
  "18230098": {
    risk: "critical",
    diagnosis: "비ST분절상승 심근경색(NSTEMI) 의심 + 급성 심부전 + 말기 신부전",
    confidence: 0.86,
    reasons: [
      "LAB: Troponin T 0.25 ng/mL — 심근손상 (NSTEMI 강력 의심)",
      "LAB: NT-proBNP 23,468 pg/mL — 중증 심부전",
      "4시간 전 발생한 흉통 + 다중 고위험 기저질환",
      "호흡수 26회/분 · SpO₂ 92% — 호흡곤란 동반",
      "기왕 심근경색(5년 전 PCI), 심방세동, 당뇨, 말기 신부전",
    ],
    recommendations: [
      "급성 관상동맥증후군 프로토콜 — Aspirin·항응고 치료, 순환기내과 즉시 협진",
      "연속 Troponin·심전도 — 3~6시간 간격 추적",
      "산소 공급·이뇨제 — 동반 심부전 관리",
      "신기능 고려 약물 용량 조정, 조영제 신독성 주의",
      "심초음파 — 좌심실 기능·국소 벽운동 평가",
      "중환자실 입원 — 지속 모니터링",
    ],
    similarCases: [
      { id: "D-4410", similarity: 0.88 },
      { id: "D-3990", similarity: 0.83 },
      { id: "D-4205", similarity: 0.78 },
    ],
  },
};

// 시연 4케이스 — MIMIC 식별자 + AI 종합소견 데이터 포함
const CASE_PATIENTS: DemoPatient[] = DEMO_CASES_4.map((c) => {
  const base = fromQueuePatient(c, {
    subject_id: c.subject_id,
    cxr_image_path: c.cxr_s3_uri,
    ecg_record_path: c.ecg_record_path,
  });
  const rec = CASE_RECOMMENDATIONS[c.subject_id];
  return rec
    ? {
        ...base,
        recommendation: rec,
        aiStatus: "done" as const,
        ecg: "done" as const, cxr: "done" as const, lab: "done" as const,
        aiVerdict: { risk: rec.risk, summary: rec.diagnosis },
      }
    : base;
});

// 합성 데모 환자 50명
const QUEUE_PATIENTS: DemoPatient[] = DEMO_PATIENTS_50.map((p) => fromQueuePatient(p));

// 트리아지 큐 / 워크리스트가 사용하는 전체 목록 (4 케이스 + 50명)
export const DEMO_PATIENTS: DemoPatient[] = [...CASE_PATIENTS, ...QUEUE_PATIENTS];

// ── 소견서 상태 로컬 캐시 (정적 데모 환자 + 백엔드 미연동 폴백) ──
// 환자 id → 소견서 상태. 페이지 이동·새로고침 사이에 데모 상태 유지.
type LocalReportStatus = "preliminary" | "reviewed" | "signed" | "amended";
const LOCAL_REPORT_STATUS = new Map<string, LocalReportStatus>();

export function setLocalReportStatus(patientId: string, status: LocalReportStatus): void {
  LOCAL_REPORT_STATUS.set(patientId, status);
}

export function getLocalReportStatus(patientId: string): LocalReportStatus | undefined {
  return LOCAL_REPORT_STATUS.get(patientId);
}

// 소견서 본문(향후 치료 의견) 로컬 캐시 — 의사 편집·서명 내용 보존
const LOCAL_REPORT_EDITS = new Map<string, string>();
export function setLocalReportEdits(patientId: string, edits: string): void {
  LOCAL_REPORT_EDITS.set(patientId, edits);
}
export function getLocalReportEdits(patientId: string): string | undefined {
  return LOCAL_REPORT_EDITS.get(patientId);
}

// 서명자 로컬 캐시
const LOCAL_REPORT_SIGNATURE = new Map<string, string>();
export function setLocalReportSignature(patientId: string, signature: string): void {
  LOCAL_REPORT_SIGNATURE.set(patientId, signature);
}
export function getLocalReportSignature(patientId: string): string | undefined {
  return LOCAL_REPORT_SIGNATURE.get(patientId);
}

// ── 라이브 환자 (트리아지 폼 제출로 생성된 백엔드 encounter) ──
// id = encounter_id. 페이지 새로고침 시 사라짐 — 데모 세션 한정.
const LIVE_PATIENTS = new Map<string, DemoPatient>();

export function registerLivePatient(p: DemoPatient): void {
  LIVE_PATIENTS.set(p.id, p);
}

export function isLivePatient(id: string): boolean {
  return LIVE_PATIENTS.has(id);
}

// "최근 등록" 전용 — 실제 트리아지로 등록된 라이브 환자만 (데모/테스트 케이스 제외).
// 최신 등록순 정렬. DB/세션 비우면 비고, 트리아지하면 추가됨.
export function getLivePatients(): DemoPatient[] {
  return [...LIVE_PATIENTS.values()].sort((a, b) =>
    (b.registeredAt ?? "").localeCompare(a.registeredAt ?? ""),
  );
}

export function getAllPatients(): DemoPatient[] {
  // 라이브(트리아지 등록) 우선 + 데모 케이스. 같은 환자(subject_id/MRN)가
  // 데모·라이브 양쪽에 있으면 1건만 노출 (중복 방지). 라이브가 먼저라 라이브가 이김.
  const merged = [...LIVE_PATIENTS.values(), ...DEMO_PATIENTS];
  const seen = new Set<string>();
  const out: DemoPatient[] = [];
  for (const p of merged) {
    const key = p.mimic?.subject_id ?? p.mrn ?? p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function findPatient(id: string): DemoPatient | undefined {
  return (
    DEMO_PATIENTS.find((p) => p.id === id) ??
    SHOWCASE_PATIENTS.find((p) => p.id === id) ??
    LIVE_PATIENTS.get(id)
  );
}

// ── 현재(최근 조회/등록) 환자 ──
// 단일 환자 컨텍스트가 없는 페이지(소견서 목록·운영 모니터링)의 좌측 사이드바용.
// 우선순위: 명시적으로 set한 환자 → 가장 최근 등록 라이브 환자 → 첫 데모 환자(폴백).
let _currentPatientId: string | null =
  (typeof localStorage !== "undefined" && localStorage.getItem("say6.currentPatient")) || null;

export function setCurrentPatientId(id: string): void {
  _currentPatientId = id;
  try { localStorage.setItem("say6.currentPatient", id); } catch { /* ignore */ }
}

export function getCurrentPatient(): DemoPatient {
  const live = [...LIVE_PATIENTS.values()];
  return (
    (_currentPatientId ? findPatient(_currentPatientId) : undefined) ??
    live[live.length - 1] ??
    DEMO_PATIENTS[0]
  );
}
