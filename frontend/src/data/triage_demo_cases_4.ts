// 시연용 핵심 4 케이스 (백엔드 lab_loader.py의 DEMO_SUBJECT_TO_DATE와 1:1 매핑)
//
// subject_id (= MIMIC subject_id = 차트번호)
//   "19041043" — Case 1: 신규 발현 심방세동 (Afib)
//   "13715870" — Case 2: 만성 이완성 심부전 급성 악화 (ADHF)
//   "15638163" — Case 3: 중증 고칼륨혈증 + ESRD (Hyperkalemia)
//   "18230098" — Case 4: NSTEMI 의심 + ADHF + ESRD
//
// 백엔드 호출 시 subject_id로 자동으로 해당 날짜 MIMIC labevents 조회.

import type { QueuePatient } from "../types/triage";

// QueuePatient에 시연 메타 추가한 확장 타입
export type DemoCasePatient = QueuePatient & {
  is_demo: true;
  case_label: string;        // "Case 1" 같은 라벨
  case_summary: string;      // 한 줄 시연 포인트
  subject_id: string;        // MIMIC subject_id (= 차트번호)
  golden_dx: string;         // 정답 진단 (시연 검증용)
  risk_level: "URGENT" | "CRITICAL";

  // ── 멀티모달 입력 자원 ─────────────────────────────────
  cxr_s3_uri: string;        // MIMIC-CXR S3 경로 (chest-svc-pre가 다운로드)
  cxr_study_id: string;      // CXR study_id (e.g., "55653653")
  ecg_record_path?: string;  // PhysioNet ECG record 경로 (선택)
};

const TODAY = "2026-05-04";

export const DEMO_CASES_4: DemoCasePatient[] = [
  // ── Case 1 ─ 신규 발현 심방세동 (Afib) — URGENT ─────────────
  {
    is_demo: true,
    case_label: "Case 1",
    case_summary: "ECG 단독 확정 — 신규 Afib (HR 114, 신뢰도 61%)",
    subject_id: "19041043",
    golden_dx: "신규 발현 심방세동 (Paroxysmal Afib) — 발병 90분",
    risk_level: "URGENT",
    cxr_s3_uri:
      "s3://say1-pre-project-5/data/mimic-cxr-jpg/files/p19/p19041043/s55653653/93fb38fb-c721d253-e194385f-61c955d3-f9a90736.jpg",
    cxr_study_id: "55653653",
    ecg_record_path:
      "s3://say2-6team/mimic/ecg/waveforms/files/p1904/p19041043/s45238325/45238325",

    id: "P-19041043",
    mrn: "19041043",
    name: "원정아",
    age: 30,
    sex: "M",
    arrived_at: `${TODAY}T08:30:00`,
    registered_at: `${TODAY}T08:31:00`,
    status: "arrived",
    ktas: 2,
    chief_complaint: "palpitation",
    complaint_detail: "발병 약 90분 전 갑작스런 두근거림. 불규칙한 심박. 휴식 시에도 지속.",
    vitals: { sbp: 129, dbp: 78, hr: 114, rr: 18, spo2: 100, bt: 36.6 },
    past_history: [],
    medications: "",
    allergies: "NKDA",
    triaged_by: "정간호사",
  },

  // ── Case 2 ─ 만성 이완성 심부전 급성 악화 (ADHF) — CRITICAL ──
  {
    is_demo: true,
    case_label: "Case 2",
    case_summary: "Lab+CXR 멀티모달 — ADHF, NT-proBNP 12,462 (정상×20)",
    subject_id: "13715870",
    golden_dx: "만성 이완성 심부전 급성 악화 (ADHF) — NT-proBNP 12,462",
    risk_level: "CRITICAL",
    cxr_s3_uri:
      "s3://say1-pre-project-5/data/mimic-cxr-jpg/files/p13/p13715870/s53940823/a3fd0c8a-75e1b24c-12028360-df56d3d4-42ee122e.jpg",
    cxr_study_id: "53940823",
    ecg_record_path:
      "s3://say2-6team/mimic/ecg/waveforms/files/p1371/p13715870/s48224691/48224691",

    id: "P-13715870",
    mrn: "13715870",
    name: "홍경태",
    age: 73,
    sex: "M",
    arrived_at: `${TODAY}T08:45:00`,
    registered_at: `${TODAY}T08:46:00`,
    status: "triage",
    ktas: 2,
    chief_complaint: "dyspnea",
    complaint_detail: "12시간 전 시작된 호흡곤란. 야간 좌위호흡 동반. CABG 및 판막치환술 과거력.",
    vitals: { sbp: 142, dbp: 88, hr: 105, rr: 34, spo2: 89, bt: 36.9 },
    past_history: ["CAD", "AFIB", "HTN"],
    medications: "Warfarin, Furosemide, Carvedilol, Atorvastatin",
    allergies: "NKDA",
    triaged_by: "정간호사",
  },

  // ── Case 3 ─ 중증 고칼륨혈증 + ESRD — CRITICAL ──────────────
  {
    is_demo: true,
    case_label: "Case 3",
    case_summary: "Lab 확정 — K+ 6.6 mEq/L (ECG 패턴 35.3%) + ESRD",
    subject_id: "15638163",
    golden_dx: "중증 고칼륨혈증 (K+ 6.6) + 말기 신부전 (BUN 172)",
    risk_level: "CRITICAL",
    cxr_s3_uri:
      "s3://say1-pre-project-5/data/mimic-cxr-jpg/files/p15/p15638163/s53577003/9f64814d-438562ea-6e1930ec-a7713602-c61d382e.jpg",
    cxr_study_id: "53577003",
    ecg_record_path:
      "s3://say2-6team/mimic/ecg/waveforms/files/p1563/p15638163/s42679999/42679999",

    id: "P-15638163",
    mrn: "15638163",
    name: "이정인",
    age: 34,
    sex: "M",
    arrived_at: `${TODAY}T09:00:00`,
    registered_at: `${TODAY}T09:01:00`,
    status: "in_consult",
    ktas: 1,
    chief_complaint: "other",
    complaint_detail: "혈뇨를 주소로 내원. 말기 신부전(투석 중). 어제 투석 시행하지 못함. 전신 무력감 동반.",
    vitals: { sbp: 158, dbp: 95, hr: 88, rr: 18, spo2: 97, bt: 36.5 },
    past_history: ["CKD"],
    medications: "혈액투석 (HD), Sevelamer, Calcitriol, Erythropoietin",
    allergies: "NKDA",
    notes: "투석 일정: 화·목·토 / 마지막 투석 2일 전",
    triaged_by: "정간호사",
  },

  // ── Case 4 ─ NSTEMI 의심 + ADHF + ESRD — CRITICAL ──────────
  {
    is_demo: true,
    case_label: "Case 4",
    case_summary: "ECG+Lab+CXR 풀멀티모달 — NSTEMI(Tropo 0.25) + ADHF + ESRD",
    subject_id: "18230098",
    golden_dx: "NSTEMI 강력 의심 (Tropo T 0.25) + ADHF (NT-proBNP 23,468) + ESRD",
    risk_level: "CRITICAL",
    cxr_s3_uri:
      "s3://say1-pre-project-5/data/mimic-cxr-jpg/files/p18/p18230098/s58964529/ef582e36-fe63fc3f-a5d512ae-9e2828c0-88d3b59d.jpg",
    cxr_study_id: "58964529",
    ecg_record_path:
      "s3://say2-6team/mimic/ecg/waveforms/files/p1823/p18230098/s46745774/46745774",

    id: "P-18230098",
    mrn: "18230098",
    name: "양정인",
    age: 86,
    sex: "F",
    arrived_at: `${TODAY}T09:15:00`,
    registered_at: `${TODAY}T09:16:00`,
    status: "testing",
    ktas: 1,
    chief_complaint: "chest_pain",
    complaint_detail: "4시간 전 발생한 흉통. 다중 고위험 기저질환 (만성 HF·ESRD·기왕 MI·Afib·DM).",
    vitals: { sbp: 138, dbp: 82, hr: 98, rr: 26, spo2: 92, bt: 36.7 },
    past_history: ["CAD", "AFIB", "DM", "CKD", "HTN"],
    medications: "Aspirin, Apixaban, Atorvastatin, Metformin, Insulin, 혈액투석 (HD)",
    allergies: "NKDA",
    notes: "기왕 심근경색 (5년 전 PCI), 투석 의존",
    triaged_by: "정간호사",
  },
];
