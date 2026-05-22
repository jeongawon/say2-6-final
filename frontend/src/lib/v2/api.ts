// say-6 v2 — 중앙 백엔드 API 레이어
// 레거시 DashboardPage 가 쓰던 엔드포인트를 v2 데모 플로우에서 재사용.
// 백엔드(localhost:8000)가 안 떠 있으면 모든 함수가 null 을 반환 → 호출부에서 demoStore 폴백.

import type { ModalRawResponse } from "../../components/modal-views/ModalViews";

/* ── 타입 ───────────────────────────────────────────────── */
export interface TriageVitalsInput {
  hr: number;
  sbp: number;
  dbp: number;
  spo2: number;
  rr: number;
  bt: number;
}

export interface TriageSubmitInput {
  name: string;
  age: number;
  sex: "M" | "F";
  vitals: TriageVitalsInput;
  chief: string;
  pastHistory: string[];
  allergies?: string;
  medications?: string;
  notes?: string;
  mimic?: { subject_id?: string; cxr_image_path?: string; ecg_record_path?: string } | null;
}

export interface TriageSubmitResult {
  patient_id: string;
  encounter_id: string;
  primary_modality?: string;
  all_modalities?: string[];
  risk_level?: string;
  status?: string;
}

export interface ModalResults {
  CXR: ModalRawResponse | null;
  ECG: ModalRawResponse | null;
  LAB: ModalRawResponse | null;
}

export interface ReportGenerateResult {
  report_id?: number | string;
  status?: string;
  narrative: string;
  model_used?: string;
  rag_available?: boolean;  // RAG svc 장애 시 false — 프론트에서 안내 배너 표시
  similar_cases?: Array<{
    chunk_type?: string;
    hadm_id?: string;
    similarity?: number;
    snippet?: string;
  }>;
}

export type ReportStatus = "preliminary" | "reviewed" | "signed" | "amended";

export interface ReportRow {
  id: number;
  encounter_id: string;
  subject_id?: string | null;       // backend encounters JOIN — 데모 환자 매칭용
  patient_name?: string | null;     // 알림 패널 row 헤더
  chief_complaint?: string | null;  // 알림 패널 row 본문
  status: ReportStatus;
  ai_diagnosis?: string;
  physician_edits?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
  created_at?: string | null;       // 알림 패널 정렬·시각 표시
  ai_risk_level?: string;
}

/* ── 공통 fetch — 실패 시 null (백엔드 다운 폴백) ─────────── */
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      console.warn(`[v2/api] ${url} → HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[v2/api] ${url} 연결 실패 (백엔드 미가동?):`, e);
    return null;
  }
}

/* ── POST /triage/submit — encounter 생성 ────────────────── */
export async function submitTriage(
  input: TriageSubmitInput,
): Promise<TriageSubmitResult | null> {
  const fhirGender = input.sex === "M" ? "male" : input.sex === "F" ? "female" : "unknown";
  const payload = {
    patient: { name: input.name, age: input.age, gender: fhirGender },
    vitals: {
      // 백엔드 VitalsForm: hr/sbp/dbp/spo2/rr/temp/gcs (float, 필수)
      hr: input.vitals.hr,
      sbp: input.vitals.sbp,
      dbp: input.vitals.dbp,
      spo2: input.vitals.spo2,
      rr: input.vitals.rr,
      temp: input.vitals.bt, // 프론트는 bt, 백엔드는 temp
      gcs: 15,
    },
    chief_complaint: {
      text: input.chief || "other",
      detail: null,
      onset_minutes_ago: 0,
    },
    past_history: input.pastHistory.map((code) => ({ text: code })),
    allergies: input.allergies || null,
    medications: input.medications || null,
    notes: input.notes || null,
    mimic: input.mimic ?? null,
  };
  return jsonFetch<TriageSubmitResult>("/triage/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ── GET /encounters/{eid}/modal-results — ECG/CXR/LAB raw ── */
export async function getModalResults(encounterId: string): Promise<ModalResults | null> {
  const data = await jsonFetch<{ results?: Partial<ModalResults> }>(
    `/encounters/${encounterId}/modal-results`,
  );
  if (!data) return null;
  const r = data.results || {};
  return { CXR: r.CXR ?? null, ECG: r.ECG ?? null, LAB: r.LAB ?? null };
}

/* ── GET /encounters/{eid}/service-requests — AI 권고 SR 시계열 ── */
export async function getServiceRequests(encounterId: string): Promise<unknown[] | null> {
  const data = await jsonFetch<unknown[]>(`/encounters/${encounterId}/service-requests`);
  return Array.isArray(data) ? data : null;
}

/* ── POST /reports/{eid}/generate — AI 종합 소견 narrative ── */
export async function generateReport(
  encounterId: string,
): Promise<ReportGenerateResult | null> {
  return jsonFetch<ReportGenerateResult>(`/reports/${encounterId}/generate`, {
    method: "POST",
  });
}

/* ── GET /reports/by-encounter/{eid} — encounter별 최신 소견서 ── */
export async function getReportByEncounter(
  encounterId: string,
): Promise<ReportRow | null> {
  return jsonFetch<ReportRow>(`/reports/by-encounter/${encounterId}`);
}

/* ── PATCH /reports/{id}/review — 의사 검토 (status → reviewed) ── */
export async function reviewReport(
  reportId: number,
  physicianEdits?: string,
): Promise<boolean> {
  const res = await jsonFetch<{ status?: string }>(`/reports/${reportId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ physician_edits: physicianEdits ?? null }),
  });
  return !!res;
}

/* ── POST /reports/{id}/sign — 의사 서명 (status → signed, FHIR final) ── */
export async function signReport(
  reportId: number,
  signedBy: string,
  physicianEdits?: string,
): Promise<boolean> {
  const res = await jsonFetch<{ status?: string }>(`/reports/${reportId}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signed_by: signedBy, physician_edits: physicianEdits ?? null }),
  });
  return !!res;
}

/* ── GET /reports/list?status= — 소견서 목록 (검토대기/서명완료 등) ── */
export async function listReports(status?: string): Promise<ReportRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await jsonFetch<ReportRow[]>(`/reports/list${q}`);
  return res ?? [];
}

/* ── GET /reports/unsigned-count — 미서명 소견서 개수 (헤더 뱃지용) ── */
export async function getUnsignedReportCount(): Promise<number> {
  const res = await jsonFetch<{ unsigned_count: number }>(`/reports/unsigned-count`);
  return res?.unsigned_count ?? 0;
}

/* ── GET /health — orchestrator 헬스체크 ───────────────────── */
export async function checkOrchestratorHealth(): Promise<boolean> {
  try {
    const res = await fetch("/health", { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── GET /route/status — 모달 서비스 헬스 상태 (router-svc) ── */
export interface ModalServiceStatus {
  ECG: "healthy" | "down";
  CXR: "healthy" | "down";
  LAB: "healthy" | "down";
}

export async function getModalServiceStatus(): Promise<ModalServiceStatus | null> {
  return jsonFetch<ModalServiceStatus>("/route/status");
}

/* ── POST /encounters/{eid}/manual-modal-result — 모달 장애 시 의사 수기 저장 ── */
export interface ManualModalResultInput {
  modality: "ECG" | "CXR" | "LAB";
  text: string;           // 의사가 직접 서술한 소견 텍스트
  summary?: string;       // 짧은 요약 (없으면 백엔드가 text 앞 200자 사용)
  risk_level?: "routine" | "urgent" | "critical";
}

export async function submitManualModalResult(
  encounterId: string,
  input: ManualModalResultInput,
): Promise<boolean> {
  const res = await jsonFetch<{ id: string }>(`/encounters/${encounterId}/manual-modal-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return !!res;
}

/* ── POST /route/analyze — orchestrator 장애 시 router 폴백 종합 분석 ── */
export interface RouterAnalyzeInput {
  patient_info: {
    age?: number;
    gender?: string;
    chief_complaint?: string;
    vitals?: Record<string, number>;
    past_history?: string[];
  };
  available_modals: string[];
  // 백엔드 AnalyzeRequest.modal_results 필드명과 일치
  // 살아있는 모달 추론 결과(dict) 또는 장애 모달 의사 직접 입력(string)
  modal_results: Partial<Record<string, string | Record<string, unknown> | null>>;
  modal_data?: Record<string, Record<string, unknown>>;
}

export interface RouterAnalyzeResult {
  narrative: string;
  source: "rag" | "bedrock_direct";
  rag_available: boolean;
  modal_results_used: string[];
  stored: false;
}

export async function analyzeViaRouter(
  input: RouterAnalyzeInput,
): Promise<RouterAnalyzeResult | null> {
  return jsonFetch<RouterAnalyzeResult>("/route/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/* ── POST /orders/{sr_id}/approve — AI 권고 승인 → 모달 실행 ── */
export async function approveOrder(srId: string): Promise<boolean> {
  const res = await jsonFetch<{ status?: string }>(`/orders/${srId}/approve`, {
    method: "POST",
  });
  return !!res;
}

/* ── POST /orders/request — 의사 직접 오더 (AI 권고와 무관) ── */
export async function requestOrder(
  encounterId: string,
  patientId: string,
  modality: "ECG" | "CXR" | "LAB",
  reason?: string,
): Promise<boolean> {
  const res = await jsonFetch<{ service_request_id?: string }>("/orders/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      encounter_id: encounterId,
      patient_id: patientId,
      modality,
      reason: reason || `의사 직접 오더: ${modality}`,
      priority: "routine",
    }),
  });
  return !!res;
}

/* ── AI 권고 (ServiceRequest 시계열 → 1·2·3차) ─────────────── */
export type ModalKey = "ECG" | "CXR" | "LAB";

export interface AIRec {
  srId: string;
  modality: ModalKey;
  rank: 1 | 2 | 3;
  status: string; // draft(미승인) / active(진행중) / completed(완료) / revoked
  reason: string;
  authoredOn: string;
  isManual: boolean; // 의사 직접 오더 (AI 권고가 아닌 의사 판단) — reason prefix "의사 직접 오더"로 식별
}

function srModality(sr: Record<string, unknown>): ModalKey | null {
  const code = (sr.code || {}) as Record<string, unknown>;
  const codings = (code.coding || []) as Array<Record<string, unknown>>;
  const d = String((codings[0] || {}).display || "").toUpperCase();
  if (d.includes("ECG") || d.includes("EKG")) return "ECG";
  if (d.includes("CXR") || d.includes("CHEST") || d.includes("X-RAY")) return "CXR";
  if (d.includes("LAB") || d.includes("BLOOD")) return "LAB";
  return null;
}

// service-requests 응답 → 1·2·3차로 묶인 AI 권고 + 의사 직접 오더.
// authoredOn 오름차순 정렬 후 5초 이상 시간 갭마다 AI 권고 차수 +1 (최대 3).
// 의사 직접 오더(reason "의사 직접 오더" prefix)는 차수 산정에서 제외 — 별도 그룹.
export function parseRecommendations(srList: unknown[]): AIRec[] {
  type Row = { srId: string; modality: ModalKey; status: string; reason: string; authoredOn: string; isManual: boolean };
  const rows: Row[] = [];
  for (const raw of srList) {
    const sr = raw as Record<string, unknown>;
    const modality = srModality(sr);
    if (!modality) continue;
    const reasonArr = (sr.reasonCode || []) as Array<Record<string, unknown>>;
    const reason = String((reasonArr[0] || {}).text || "");
    rows.push({
      srId: String(sr.id || ""),
      modality,
      status: String(sr.status || ""),
      reason,
      authoredOn: String(sr.authoredOn || ""),
      isManual: /^의사\s*직접\s*오더/.test(reason),
    });
  }
  rows.sort((a, b) => a.authoredOn.localeCompare(b.authoredOn));

  const TIME_CLUSTER_MS = 5_000;
  let rank = 1;
  let prevMs = 0;
  return rows.map((r) => {
    if (r.isManual) {
      // 의사 오더는 rank 계산·전이에 영향 없음. 표기상 1로 두지만 isManual=true로 별도 처리.
      return { ...r, rank: 1 as 1 | 2 | 3 };
    }
    const t = new Date(r.authoredOn).getTime();
    if (prevMs && !isNaN(t) && t - prevMs > TIME_CLUSTER_MS) rank = Math.min(rank + 1, 3);
    if (!isNaN(t)) prevMs = t;
    return { ...r, rank: rank as 1 | 2 | 3 };
  });
}
