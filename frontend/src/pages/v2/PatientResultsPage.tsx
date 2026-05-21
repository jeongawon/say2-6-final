import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, FlaskConical, Image as ImageIcon, FileText, Maximize2, Loader2,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { Card, CardHeader, CardTitle, CardBody } from "../../components/v2/ui/Card";
import { RiskBadge } from "../../components/v2/RiskBadge";
import { findPatient } from "../../lib/v2/demoStore";
import type { ModalKey } from "../../lib/v2/api";
import { CXRView, ECGView, LabView } from "../../components/modal-views/ModalViews";
import { CxrPacsViewer } from "../../components/modal-views/CxrPacsViewer";
import { PatientInfoSidebar, fmtTime } from "../../components/v2/PatientInfoSidebar";
import { LiveBadge } from "../../components/v2/LiveBadge";
import { useEncounterData } from "../../lib/v2/useEncounterData";
import { cn } from "../../lib/cn";

type ModalStatus = "pending" | "running" | "done";

const MODAL_LABEL: Record<ModalKey, string> = {
  ECG: "심전도 12-Lead",
  CXR: "흉부 X-ray",
  LAB: "혈액 검사",
};
const MODAL_ICON: Record<ModalKey, typeof Activity> = {
  ECG: Activity, CXR: ImageIcon, LAB: FlaskConical,
};

/* ─────────────────────────────────────────────────────────
   AI 판독 검사결과 — ECG·CXR·LAB을 한 박스 안 3단락으로 동시 표시
   좌: 환자정보 / 우: 3단락(ECG | CXR | LAB)
   ───────────────────────────────────────────────────────── */
export default function PatientResultsPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const encounterId = searchParams.get("encounter_id");
  const nav = useNavigate();
  const patient = useMemo(() => findPatient(id), [id]);
  const [cxrPacsOpen, setCxrPacsOpen] = useState(false);

  const { modalResults, recs, wsStatus } = useEncounterData(encounterId);

  const reportHref = encounterId
    ? `/demo/patient/${id}/report?encounter_id=${encounterId}`
    : `/demo/patient/${id}/report`;

  if (!patient) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-20 text-center">
          <p className="text-slate-500 dark:text-vuno-muted">환자를 찾을 수 없습니다.</p>
        </div>
      </AppShell>
    );
  }

  // AI가 실제 판독한 모달 = recommendation.reasons의 "ECG:/CXR:/LAB:" 접두사
  const read = new Set<string>();
  patient.recommendation?.reasons.forEach((r) => {
    const mm = r.match(/^(ECG|CXR|LAB)\s*[:：]/);
    if (mm) read.add(mm[1]);
  });

  const modalStatus = (m: ModalKey): ModalStatus => {
    if (modalResults?.[m]) return "done";
    const rec = recs.find((r) => r.modality === m);
    if (rec?.status === "completed") return "done";
    if (rec?.status === "active") return "running";
    if (rec?.status === "draft") return "pending";
    if (encounterId) return "pending";
    // 정적 데모: AI가 판독한 모달만 결과 노출, 나머지는 대기(미요청)
    return read.has(m) ? patient[m.toLowerCase() as "ecg" | "cxr" | "lab"] : "pending";
  };

  return (
    <AppShell notifications={3}>
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)]">
        <div className="max-w-[1700px] mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-stretch min-h-[calc(100vh-3.5rem)]">
          {/* ── 좌: 환자 정보 ── */}
          <PatientInfoSidebar patient={patient} />

          {/* ── 우: AI 판독 검사결과 (ECG · CXR · LAB 3단락) ── */}
          <section className="min-w-0">
            <Card className="overflow-hidden h-full flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2">
                <span className="text-base font-bold text-slate-900 dark:text-white">AI 판독 검사결과</span>
                <span className="text-[10px] text-slate-400 dark:text-vuno-dim tracking-wider uppercase">AI Read · ECG · CXR · LAB</span>
                <LiveBadge status={wsStatus} className="ml-auto" />
                <button
                  onClick={() => nav(reportHref)}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[13px] font-bold transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" /> AI 종합소견 생성
                </button>
              </div>

              {/* 3단락 — 한 박스 안 ECG | CXR | LAB */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 min-h-0">
                {/* ECG */}
                <ResultSection modality="ECG" status={modalStatus("ECG")}>
                  {modalResults?.ECG
                    ? <ModalViewFrame><ECGView ecgResult={modalResults.ECG} isLoading={false} /></ModalViewFrame>
                    : encounterId
                      ? <PendingModal kind="ECG" status={modalStatus("ECG")} />
                      : read.has("ECG")
                        ? <ECGTab risk={patient.aiVerdict?.risk ?? "normal"} />
                        : <PendingModal kind="ECG" status="pending" />}
                </ResultSection>

                {/* CXR */}
                <ResultSection modality="CXR" status={modalStatus("CXR")}>
                  {modalResults?.CXR
                    ? (
                      <div>
                        <button
                          onClick={() => setCxrPacsOpen(true)}
                          className="mb-2 inline-flex items-center gap-1.5 h-7 px-3 bg-[#0d1320] text-cyan-300 border border-cyan-500/40 text-[11px] font-bold hover:bg-[#131b2e]"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> PACS 뷰어로 보기
                        </button>
                        <ModalViewFrame>
                          <CXRView subjectId={patient.mimic?.subject_id ?? null} cacheKey="" cxrResult={modalResults.CXR} isLoading={false} />
                        </ModalViewFrame>
                      </div>
                    )
                    : encounterId
                      ? <PendingModal kind="CXR" status={modalStatus("CXR")} />
                      : read.has("CXR")
                        ? <CXRTab />
                        : <PendingModal kind="CXR" status="pending" />}
                </ResultSection>

                {/* LAB */}
                <ResultSection modality="LAB" status={modalStatus("LAB")}>
                  {modalResults?.LAB
                    ? <ModalViewFrame><LabView labResult={modalResults.LAB} isLoading={false} /></ModalViewFrame>
                    : encounterId
                      ? <PendingModal kind="LAB" status={modalStatus("LAB")} />
                      : read.has("LAB")
                        ? <LABTab />
                        : <PendingModal kind="LAB" status="pending" />}
                </ResultSection>
              </div>
            </Card>
          </section>
        </div>
      </div>

      {/* CXR PACS 풀스크린 뷰어 */}
      {cxrPacsOpen && modalResults?.CXR && (
        <CxrPacsViewer
          result={modalResults.CXR}
          subjectId={patient.mimic?.subject_id ?? null}
          patientName={patient.name}
          patientMeta={`${patient.sex === "M" ? "남" : "여"} / ${patient.age}세`}
          studyDateLabel={fmtTime(patient.arrivedAt)}
          onClose={() => setCxrPacsOpen(false)}
        />
      )}
    </AppShell>
  );
}

/* ── 한 단락 (모달별 헤더 + 결과 본문) ── */
function ResultSection({ modality, status, children }: {
  modality: ModalKey; status: ModalStatus; children: React.ReactNode;
}) {
  const Icon = MODAL_ICON[modality];
  return (
    <div className="flex flex-col min-h-0 border border-slate-200 dark:border-vuno-border rounded-xl overflow-hidden bg-white dark:bg-vuno-surface">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2">
        <span className="h-6 w-6 grid place-items-center rounded bg-brand-50 dark:bg-brand-500/15 text-brand-600 flex-shrink-0">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-900 dark:text-white leading-none">{modality}</div>
          <div className="text-[10px] text-slate-400 dark:text-vuno-dim mt-0.5">{MODAL_LABEL[modality]}</div>
        </div>
        <span className="ml-auto"><StatusBadge status={status} /></span>
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ModalStatus }) {
  if (status === "done") return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓ 완료</span>;
  if (status === "running") return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">분석 중</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-vuno-bg dark:text-vuno-muted">대기</span>;
}

/* ═══════════════════════════════════════════════════════════
   검사 본문 — 백엔드 연동 / 정적 폴백
   ═══════════════════════════════════════════════════════════ */
function ModalViewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[460px] border border-slate-200 dark:border-vuno-border rounded-lg overflow-hidden bg-white dark:bg-vuno-surface">
      {children}
    </div>
  );
}

function PendingModal({ kind, status }: { kind: ModalKey; status: ModalStatus }) {
  return (
    <div className="h-[360px] flex flex-col items-center justify-center text-center border border-dashed border-slate-300 dark:border-vuno-border rounded-lg bg-slate-50 dark:bg-vuno-bg">
      {status === "running" ? (
        <>
          <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-3" />
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{kind} 분석 중…</div>
          <div className="text-xs text-slate-500 dark:text-vuno-muted mt-1">AI 모달 판독이 진행 중입니다</div>
        </>
      ) : (
        <>
          <div className="text-3xl mb-2">🩺</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{kind} 검사 승인 대기</div>
          <div className="text-xs text-slate-500 dark:text-vuno-muted mt-1 px-3">
            <b>AI 분석</b> 화면에서 {kind} 권고를 승인하면 분석이 시작됩니다.
          </div>
        </>
      )}
    </div>
  );
}

/* AI 판정 카드 — 모달별 결괏값을 패널 안에 함께 표시 (정적 데모 폴백) */
function VerdictCard({ modality, level, levelText, verdict, children }: {
  modality: ModalKey;
  level: "critical" | "urgent" | "warning" | "normal";
  levelText?: string;
  verdict: string;
  children?: React.ReactNode;
}) {
  const danger = level === "critical" || level === "urgent";
  return (
    <Card className={cn(
      "border",
      danger
        ? "border-red-200 bg-red-50/40 dark:border-red-500/40 dark:bg-red-500/15"
        : "border-slate-200 dark:border-vuno-border",
    )}>
      <CardHeader>
        <CardTitle className="text-[13px] flex items-center gap-2">
          🤖 AI 판정 ({modality})
          <RiskBadge level={level} text={levelText} size="sm" />
        </CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-relaxed">{verdict}</p>
        {children}
      </CardBody>
    </Card>
  );
}

function ECGTab({ risk }: { risk: string }) {
  const critical = risk === "critical";
  return (
    <div className="space-y-4">
      {/* 12-Lead 파형 */}
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="text-[11px] text-emerald-400 mb-2 font-numeric">12-Lead ECG · 25 mm/s · 10 mm/mV</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-numeric text-[11px] text-emerald-400">
          {["I", "aVR", "V1", "V4", "II", "aVL", "V2", "V5", "III", "aVF", "V3", "V6"].map((lead) => (
            <div key={lead} className="flex items-center gap-2">
              <span className="w-8 text-emerald-500 font-semibold">{lead}</span>
              <svg viewBox="0 0 200 24" className="flex-1 h-5">
                <path
                  d={lead.startsWith("V") && (lead === "V2" || lead === "V3" || lead === "V4")
                    ? "M0,12 L20,12 L25,4 L30,18 L35,2 L45,12 L70,12 L75,4 L80,18 L85,2 L95,12 L120,12 L125,4 L130,18 L135,2 L145,12 L170,12 L175,4 L180,18 L185,2 L195,12 L200,12"
                    : "M0,12 L20,12 L25,8 L30,14 L35,6 L45,12 L70,12 L75,8 L80,14 L85,6 L95,12 L120,12 L125,8 L130,14 L135,6 L145,12 L170,12 L175,8 L180,14 L185,6 L195,12 L200,12"}
                  stroke={lead.startsWith("V") && (lead === "V2" || lead === "V3" || lead === "V4") ? "#f87171" : "#34d399"}
                  strokeWidth="0.8"
                  fill="none"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* 결괏값 패널 (이미지 밑 하나) — AI 판정. 실제 측정값/신뢰도는 백엔드 ECG 출력 연동 시 표시 */}
      <VerdictCard
        modality="ECG"
        level={critical ? "urgent" : "normal"}
        levelText={critical ? "urgent" : "normal"}
        verdict={critical
          ? "Anterior wall에서 ST 상승이 명확히 관찰됨 (V2–V4). Reciprocal change 동반 — STEMI 의심."
          : "동율동, 명백한 ST 변화 없음. 정상 범위 심전도."}
      />
    </div>
  );
}

function CXRTab() {
  return (
    <div className="space-y-4">
      {/* CXR 이미지 */}
      <div className="aspect-[4/3] rounded-lg bg-slate-900 grid place-items-center text-slate-500 text-sm border border-slate-700">
        <div className="text-center">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <div className="text-xs">CXR 이미지 영역</div>
          <div className="text-[10px] mt-1 opacity-60">S3 PreSigned URL 연동 예정</div>
        </div>
      </div>

      {/* AI 판정 패널 (밑에) */}
      <VerdictCard modality="CXR" level="normal" levelText="normal" verdict="흉부 X-ray 정상 범위. 급성 폐·심장 이상 소견 없음.">
        <ul className="mt-2 text-[12px] space-y-1 text-slate-700 dark:text-slate-200">
          <li>· 폐 침윤 음영 없음</li>
          <li>· 심장 음영 정상 범위</li>
          <li>· 늑막 삼출 없음</li>
          <li>· 골 구조물 이상 없음</li>
        </ul>
      </VerdictCard>
    </div>
  );
}

function LABTab() {
  const rows: Array<{ name: string; value: string; unit: string; ref: string; flag?: "high" | "low" }> = [
    { name: "Troponin I", value: "0.82", unit: "ng/mL", ref: "<0.04", flag: "high" },
    { name: "CK-MB", value: "12.4", unit: "ng/mL", ref: "<6.3", flag: "high" },
    { name: "WBC", value: "10.2", unit: "10³/µL", ref: "4.0–10.0", flag: "high" },
    { name: "Hb", value: "14.1", unit: "g/dL", ref: "13.5–17.5" },
    { name: "Platelet", value: "245", unit: "10³/µL", ref: "150–400" },
    { name: "Glucose", value: "112", unit: "mg/dL", ref: "70–110", flag: "high" },
    { name: "Cr", value: "0.9", unit: "mg/dL", ref: "0.7–1.3" },
  ];
  return (
    <div className="space-y-4">
      {/* 결과 표 */}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-slate-500 dark:text-vuno-muted border-b border-slate-200 dark:border-vuno-border">
            <th className="py-1.5 pr-2 font-medium">항목</th>
            <th className="py-1.5 pr-2 font-medium text-right">값</th>
            <th className="py-1.5 pr-2 font-medium">참고치</th>
            <th className="py-1.5 font-medium">Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-slate-100 dark:border-vuno-divider">
              <td className="py-2 pr-2 font-medium text-slate-900 dark:text-white">{r.name}</td>
              <td className={"py-2 pr-2 text-right font-numeric font-semibold " + (r.flag === "high" ? "text-critical" : r.flag === "low" ? "text-blue-600 dark:text-blue-300" : "text-slate-900 dark:text-white")}>
                {r.value}<span className="text-[10px] font-normal text-slate-400 dark:text-vuno-dim ml-0.5">{r.unit}</span>
              </td>
              <td className="py-2 pr-2 text-slate-500 dark:text-vuno-muted font-numeric">{r.ref}</td>
              <td className="py-2">
                {r.flag === "high" && <RiskBadge level="urgent" text="↑↑" size="sm" />}
                {r.flag === "low" && <RiskBadge level="warning" text="↓" size="sm" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* AI 판정 패널 (밑에) */}
      <VerdictCard modality="LAB" level="urgent" levelText="urgent" verdict="심근효소(Troponin I, CK-MB) 상승 — 급성 심근손상 시사. 백혈구·혈당 경도 상승." />
    </div>
  );
}

