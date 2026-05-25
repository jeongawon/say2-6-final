// say-6 v2 — 중앙 백엔드 API 레이어
// 레거시 DashboardPage 가 쓰던 엔드포인트를 v2 데모 플로우에서 재사용.
// 백엔드(localhost:8000)가 안 떠 있으면 모든 함수가 null 을 반환 → 호출부에서 demoStore 폴백.

import type { ModalRawResponse } from "../../components/modal-views/ModalViews";
import { CHIEF_COMPLAINT_LABELS, type ChiefComplaint } from "../../types/triage";

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
  // 영문 주호소 코드 — 백엔드 CC Map(영문 MIMIC) 라우팅용. 데모 케이스에서 전달.
  // 있으면 chief_complaint.text=영문(CC Map 매칭), chief(한국어)는 detail로.
  chiefCode?: ChiefComplaint;
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
  // CC Map은 영문 MIMIC 기준 — 영문 코드가 있으면 text=영문(라우팅), 한국어 chief는 detail로.
  // 코드가 없으면(수동 입력) 기존대로 chief를 text로 사용.
  const ccText = input.chiefCode ? CHIEF_COMPLAINT_LABELS[input.chiefCode].en : input.chief || "other";
  const ccDetail = input.chiefCode ? input.chief || null : null;
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
      text: ccText,
      detail: ccDetail,
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

/* ── GET /encounters/list — 실제 등록된 환자(워크리스트) 상태 ── */
export interface EncounterListItem {
  encounter_id: string;
  subject_id: string | null;
  patient_name: string | null;
  chief_complaint: string | null;
  report_status: ReportStatus | null;   // null이면 아직 소견서 없음
  ai_risk_level: string | null;
}
export async function listEncounters(
  status = "active",
  limit = 50,
): Promise<EncounterListItem[] | null> {
  const data = await jsonFetch<EncounterListItem[]>(
    `/encounters/list?status=${status}&limit=${limit}`,
  );
  return Array.isArray(data) ? data : null;
}

/* ── GET /ops/health — 모달 추론 서버 실시간 상태 (ECG/CXR/LAB) ──
   응답: {"ECG":true,"CXR":true,"LAB":true}. 서버 끊기면 false → UI 자동 "비활성". */
export async function getModalHealth(): Promise<Record<ModalKey, boolean> | null> {
  return jsonFetch<Record<ModalKey, boolean>>(`/ops/health`);
}

/* ── GET /ops/metrics — 실제 CloudWatch 운영 메트릭 (운영 모니터링 대시보드) ── */
export interface OpsPoint { t: string; v: number }
export interface OpsServiceMetric {
  key: string; label: string;
  running: number | null; desired: number | null;
  cpu: OpsPoint[]; mem: OpsPoint[];
}
export interface OpsAlarm { sev: "critical" | "warning"; name: string; metric: string; value: string; threshold: string; since: string }
export interface OpsMetrics {
  region?: string;
  services: OpsServiceMetric[];
  alb: { req?: OpsPoint[]; elb5xx?: OpsPoint[]; tgt5xx?: OpsPoint[]; p50?: OpsPoint[]; p90?: OpsPoint[]; p99?: OpsPoint[] };
  aurora: { cpu?: OpsPoint[]; acu?: OpsPoint[]; conn?: OpsPoint[]; mem?: OpsPoint[] };
  alarms: OpsAlarm[];
  error?: string;
}
export async function getOpsMetrics(): Promise<OpsMetrics | null> {
  return jsonFetch<OpsMetrics>(`/ops/metrics`);
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
      reason: reason || `의사 직접 지시: ${modality}`,
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
      isManual: /^의사\s*직접\s*(지시|오더)/.test(reason),
    });
  }
  rows.sort((a, b) => a.authoredOn.localeCompare(b.authoredOn));

  const TIME_CLUSTER_MS = 5_000;
  let rank = 1;
  let prevMs = 0;
  const ranked: AIRec[] = rows.map((r) => {
    if (r.isManual) {
      // 의사 오더는 rank 계산·전이에 영향 없음. 표기상 1로 두지만 isManual=true로 별도 처리.
      return { ...r, rank: 1 as 1 | 2 | 3 };
    }
    const t = new Date(r.authoredOn).getTime();
    if (prevMs && !isNaN(t) && t - prevMs > TIME_CLUSTER_MS) rank = Math.min(rank + 1, 3);
    if (!isNaN(t)) prevMs = t;
    return { ...r, rank: rank as 1 | 2 | 3 };
  });

  // 이미 '완료'된 모달은 같은 모달의 미완료 권고(승인 대기·진행 중)를 가린다.
  // 예: 의사가 LAB을 직접 오더해 완료 → AI가 ECG 기반으로 만든 2차 LAB '승인 대기' SR이
  //     남아 '2차 권고 LAB 승인 대기' + '의사 직접 오더 LAB 완료'로 모순 표시되는 것을 방지.
  const completedMods = new Set(
    ranked.filter((r) => r.status === "completed").map((r) => r.modality),
  );
  const filtered = ranked.filter(
    (r) => r.status === "completed" || !completedMods.has(r.modality),
  );

  // 모달 단위 중복 제거 — AI 권고·의사 오더 통합.
  // (백엔드가 동일 권고를 시간차로 중복 생성하거나, AI 권고와 의사 오더가 같은 모달로
  //  겹치면 하나로 합친다.) 가장 진행된 상태(완료>분석중>대기)를 남기고,
  // 차수(rank)는 가장 이른 값을 유지한다.
  const sRank = (s: string) => (s === "completed" ? 3 : s === "active" ? 2 : 1);
  const idxByModality = new Map<ModalKey, number>();
  const out: AIRec[] = [];
  for (const r of filtered) {
    const idx = idxByModality.get(r.modality);
    if (idx === undefined) {
      idxByModality.set(r.modality, out.length);
      out.push(r);
    } else {
      const ex = out[idx];
      const rankKept = Math.min(ex.rank, r.rank) as 1 | 2 | 3;
      out[idx] = sRank(r.status) > sRank(ex.status) ? { ...r, rank: rankKept } : { ...ex, rank: rankKept };
    }
  }
  return out;
}
