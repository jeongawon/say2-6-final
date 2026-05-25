import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, FlaskConical, Image as ImageIcon, FileText, Maximize2, Loader2,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { Card, CardHeader, CardTitle, CardBody } from "../../components/v2/ui/Card";
import { RiskBadge } from "../../components/v2/RiskBadge";
import { ConfidenceBadge } from "../../components/v2/ConfidenceBadge";
import { findPatient } from "../../lib/v2/demoStore";
import type { ModalKey } from "../../lib/v2/api";
import { CXRView, ECGView, LabView, type ModalRawResponse } from "../../components/modal-views/ModalViews";
import { CxrPacsViewer } from "../../components/modal-views/CxrPacsViewer";
import { PatientInfoSidebar, fmtTime } from "../../components/v2/PatientInfoSidebar";
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

  const { modalResults, recs } = useEncounterData(encounterId);

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
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)] lg:grid lg:grid-cols-[390px_minmax(0,1fr)] lg:h-[calc(100vh-3.5rem)] lg:items-stretch lg:overflow-hidden">
        {/* ── 좌: 환자 정보 (상단·좌측·하단 flush 도킹 · 의사 수정 가능) ── */}
        <PatientInfoSidebar patient={patient} allowEdit className="lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto" />

        {/* ── 우: AI 판독 검사결과 (ECG · CXR · LAB 3단락) ── */}
        <section className="min-w-0 px-5 py-5 lg:h-full lg:overflow-hidden">
            <Card className="overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-3">
                <span className="h-11 w-11 grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-ai-accent text-white flex-shrink-0">
                  <Activity className="h-6 w-6" />
                </span>
                <span className="text-[22px] font-bold text-slate-900 dark:text-white leading-none">AI 판독 검사결과</span>
                <span className="text-[15px] text-slate-500 dark:text-vuno-muted leading-none">· AI READ · ECG · CXR · LAB</span>
                <button
                  onClick={() => nav(reportHref)}
                  className="ml-auto inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[16px] font-bold transition-colors flex-shrink-0"
                >
                  <FileText className="h-5 w-5" /> AI 종합소견 생성
                </button>
              </div>

              {/* 3단락 — 한 박스 안 ECG | CXR | LAB (가로형 이미지 + AI 판단결과로 칸 채움) */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 min-h-0">
                {/* ECG */}
                <ResultSection modality="ECG" status={modalStatus("ECG")}>
                  {modalResults?.ECG
                    ? <div className="flex flex-col h-full gap-3"><ModalViewFrame><ECGView ecgResult={modalResults.ECG} isLoading={false} /></ModalViewFrame><ModalVerdict result={modalResults.ECG} modality="ECG" className="flex-1" /></div>
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
                      <div className="flex flex-col h-full gap-3">
                        <button
                          onClick={() => setCxrPacsOpen(true)}
                          className="flex-shrink-0 self-start inline-flex items-center gap-1.5 h-7 px-3 bg-[#0d1320] text-cyan-300 border border-cyan-500/40 text-[11px] font-bold hover:bg-[#131b2e]"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> PACS 뷰어로 보기
                        </button>
                        <ModalViewFrame>
                          <CXRView subjectId={patient.mimic?.subject_id ?? null} cacheKey="" cxrResult={modalResults.CXR} isLoading={false} />
                        </ModalViewFrame>
                        <ModalVerdict result={modalResults.CXR} modality="CXR" className="flex-1" />
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
                    ? <div className="flex flex-col h-full gap-3"><ModalViewFrame><LabView labResult={modalResults.LAB} isLoading={false} /></ModalViewFrame><ModalVerdict result={modalResults.LAB} modality="LAB" className="flex-1" /></div>
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
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2.5">
        <span className="h-8 w-8 grid place-items-center rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-600 flex-shrink-0">
          <Icon className="h-5 w-5" />
        </span>
        {/* 모달명 + 한글 라벨 직렬 */}
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-slate-900 dark:text-white">{modality}</span>
          <span className="text-[12px] text-slate-400 dark:text-vuno-dim truncate">{MODAL_LABEL[modality]}</span>
        </div>
        <span className="ml-auto flex-shrink-0"><StatusBadge status={status} /></span>
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ModalStatus }) {
  if (status === "done") return <span className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓ 완료</span>;
  if (status === "running") return <span className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">분석 중</span>;
  return <span className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-slate-100 text-slate-500 dark:bg-vuno-bg dark:text-vuno-muted">대기</span>;
}

/* ═══════════════════════════════════════════════════════════
   검사 본문 — 백엔드 연동 / 정적 폴백
   ═══════════════════════════════════════════════════════════ */
function ModalViewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[300px] border border-slate-200 dark:border-vuno-border rounded-lg overflow-hidden bg-white dark:bg-vuno-surface">
      {children}
    </div>
  );
}

function PendingModal({ kind, status }: { kind: ModalKey; status: ModalStatus }) {
  return (
    <div className="flex flex-col h-full gap-3">
      {/* 이미지/대기 박스 — 다른 모달 이미지와 동일 규격(300px), 텍스트 크게 */}
      <div className="h-[300px] flex-shrink-0 flex flex-col items-center justify-center text-center border border-dashed border-slate-300 dark:border-vuno-border rounded-lg bg-slate-50 dark:bg-vuno-bg px-4">
        {status === "running" ? (
          <>
            <Loader2 className="h-10 w-10 text-brand-500 animate-spin mb-3" />
            <div className="text-[17px] font-bold text-slate-700 dark:text-slate-200">{kind} 분석 중…</div>
            <div className="text-[13px] text-slate-500 dark:text-vuno-muted mt-1.5">AI 모달 판독이 진행 중입니다</div>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3">🩺</div>
            <div className="text-[17px] font-bold text-slate-700 dark:text-slate-200">{kind} 검사 승인 대기</div>
            <div className="text-[13px] text-slate-500 dark:text-vuno-muted mt-1.5 leading-relaxed">
              <b>AI 분석</b> 화면에서 {kind} 권고를 승인하면 분석이 시작됩니다.
            </div>
          </>
        )}
      </div>
      {/* AI 판단결과 placeholder — 나머지 칸 채움 (실제 연동 시 결과로 채워짐) */}
      <div className="flex-1 min-h-0 grid place-items-center text-center rounded-lg border border-dashed border-slate-200 dark:border-vuno-border bg-slate-50/50 dark:bg-vuno-bg/40 px-3 py-4">
        <div>
          <div className="text-[16px] font-bold text-slate-400 dark:text-vuno-dim">🤖 AI 판단결과 — 분석 대기</div>
          <div className="text-[13px] text-slate-400 dark:text-vuno-dim mt-1.5">검사 완료 시 판독 결과가 여기에 표시됩니다.</div>
        </div>
      </div>
    </div>
  );
}

/* 백엔드 모달 결과(raw)의 AI 판단결과 카드 — risk_level+summary로 구성, 가로형 프레임 아래 칸을 채움 */
// CXR 소견명·중증도·권고 한글 매핑 — chest-svc가 영어로 내보내므로 프론트에서 한국어로 재구성.
const CXR_NAME_KO: Record<string, string> = {
  Cardiomegaly: "심비대", Pleural_Effusion: "흉막삼출", Edema: "폐부종",
  Pneumothorax: "기흉", Atelectasis: "무기폐", Enlarged_Cardiomediastinum: "종격동 비대",
  Consolidation: "폐 경화", Pneumonia: "폐렴", Lung_Opacity: "폐 음영",
  Fracture: "골절", Support_Devices: "의료기기 삽입", No_Finding: "특이 소견 없음",
};
const CXR_SEV_KO: Record<string, string> = { mild: "경도", moderate: "중등도", severe: "중증" };
const CXR_DIFF_KO: Record<string, string> = { Atelectasis: "폐렴 감별 필요", Pleural_Effusion: "혈흉 감별 필요" };
const CXR_REC_KO: Record<string, string> = {
  "Echocardiography recommended": "심초음파 권장",
  "Clinical correlation with BNP recommended": "BNP 등 임상 연관성 확인 권장",
  "Clinical correlation recommended": "임상 연관성 확인 권장",
};

function cxrKoreanVerdict(result: ModalRawResponse): string {
  const findings = (result.findings as Array<Record<string, unknown>>) || [];
  const ctr = (result.measurements as { ctr?: number } | undefined)?.ctr;
  const lines: string[] = [];
  let n = 1;
  // 검출된 소견
  for (const f of findings) {
    if (f.name === "No_Finding" || !f.detected) continue;
    const ko = CXR_NAME_KO[String(f.name)] || String(f.name);
    const sev = CXR_SEV_KO[String(f.severity)] || "";
    const loc = f.location === "right" ? "우측 " : f.location === "left" ? "좌측 " : "";
    let line = `${n}. ${sev ? sev + " " : ""}${loc}${ko}`;
    if (f.name === "Cardiomegaly" && typeof ctr === "number") line += ` (CTR ${ctr.toFixed(2)})`;
    if (CXR_DIFF_KO[String(f.name)]) line += ` (${CXR_DIFF_KO[String(f.name)]})`;
    const rec = CXR_REC_KO[String(f.recommendation)];
    if (rec) line += ` — ${rec}`;
    lines.push(line);
    n++;
  }
  // 주요 정상 소견(검출 안 됨)
  for (const f of findings) {
    if (f.detected || f.name === "No_Finding") continue;
    if (f.name === "Pneumothorax" || f.name === "Enlarged_Cardiomediastinum") {
      lines.push(`${n}. ${CXR_NAME_KO[String(f.name)] || String(f.name)} 없음`);
      n++;
    }
  }
  return lines.join("\n");
}

function ModalVerdict({ result, modality, className }: { result: ModalRawResponse; modality?: ModalKey; className?: string }) {
  const risk = String((result as { risk_level?: string })?.risk_level ?? "").toLowerCase();
  const level: "critical" | "urgent" | "warning" | "normal" =
    risk === "critical" ? "critical" :
    risk === "high" || risk === "urgent" ? "urgent" :
    risk === "medium" || risk === "moderate" || risk === "warning" ? "warning" : "normal";
  const summary = String((result as { summary?: string })?.summary ?? "");
  // CXR이고 요약이 영어(한글 없음)면 구조화 소견으로 한국어 재구성. (chest-svc가 한국어를 주면 그대로 사용)
  const hasKorean = /[가-힣]/.test(summary);
  let verdict = summary;
  if (modality === "CXR" && !hasKorean) {
    verdict = cxrKoreanVerdict(result) || summary;
  }
  if (!verdict) verdict = "AI 판독 결과 요약이 없습니다.";
  return <VerdictCard level={level} verdict={verdict} confidence={92} className={className} />;
}

/* AI 판정 카드 — 모달별 결괏값을 패널 안에 함께 표시 */
function VerdictCard({ level, levelText, verdict, confidence = 92, children, className }: {
  modality?: ModalKey;
  level: "critical" | "urgent" | "warning" | "normal";
  levelText?: string;
  verdict: string;
  confidence?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const danger = level === "critical" || level === "urgent";
  return (
    <Card className={cn(
      "border",
      danger
        ? "border-red-200 bg-red-50/40 dark:border-red-500/40 dark:bg-red-500/15"
        : "border-slate-200 dark:border-vuno-border",
      className,
    )}>
      <CardHeader>
        <CardTitle className="text-[17px] flex items-center gap-2 flex-wrap">
          🤖 AI 판단결과
          <RiskBadge level={level} text={levelText} size="lg" />
          <ConfidenceBadge value={confidence} size="lg" className="ml-auto" />
        </CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">{verdict}</p>
        {children}
      </CardBody>
    </Card>
  );
}

function ECGTab({ risk }: { risk: string }) {
  const critical = risk === "critical";
  return (
    <div className="flex flex-col h-full gap-4">
      {/* 12-Lead 파형 — CXR 이미지와 동일 규격(고정 높이) */}
      <div className="h-[300px] flex-shrink-0 rounded-lg bg-slate-900 p-4 flex flex-col overflow-hidden">
        <div className="text-[11px] text-emerald-400 mb-2 font-numeric flex-shrink-0">12-Lead ECG · 25 mm/s · 10 mm/mV</div>
        <div className="flex-1 grid grid-cols-2 gap-x-4 content-around font-numeric text-[11px] text-emerald-400">
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

      {/* 결괏값 패널 (이미지 밑, 나머지 칸 채움) — AI 판정. 실제 측정값/신뢰도는 백엔드 ECG 출력 연동 시 표시 */}
      <VerdictCard
        modality="ECG"
        className="flex-1"
        level={critical ? "urgent" : "normal"}
        levelText={critical ? "urgent" : "normal"}
        confidence={critical ? 96 : 91}
        verdict={critical
          ? "Anterior wall에서 ST 상승이 명확히 관찰됨 (V2–V4). Reciprocal change 동반 — STEMI 의심."
          : "동율동, 명백한 ST 변화 없음. 정상 범위 심전도."}
      />
    </div>
  );
}

function CXRTab() {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* CXR 이미지 — ECG 파형과 동일 규격(고정 높이) */}
      <div className="h-[300px] flex-shrink-0 rounded-lg bg-slate-900 grid place-items-center text-slate-500 text-sm border border-slate-700">
        <div className="text-center">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <div className="text-xs">CXR 이미지 영역</div>
          <div className="text-[10px] mt-1 opacity-60">S3 PreSigned URL 연동 예정</div>
        </div>
      </div>

      {/* AI 판정 패널 (밑에, 나머지 칸 채움) */}
      <VerdictCard className="flex-1" modality="CXR" level="normal" levelText="normal" confidence={93} verdict="흉부 X-ray 정상 범위. 급성 폐·심장 이상 소견 없음.">
        <ul className="mt-2 text-[14px] space-y-1 text-slate-700 dark:text-slate-200">
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
    <div className="flex flex-col h-full gap-4">
      {/* 결과 표 — ECG·CXR 이미지와 동일한 300px 박스 */}
      <div className="h-[300px] flex-shrink-0 overflow-auto rounded-lg border border-slate-200 dark:border-vuno-border p-3">
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
      </div>

      {/* AI 판정 패널 (밑에, 나머지 칸 채움) */}
      <VerdictCard className="flex-1" modality="LAB" level="urgent" levelText="urgent" confidence={95} verdict="심근효소(Troponin I, CK-MB) 상승 — 급성 심근손상 시사. 백혈구·혈당 경도 상승." />
    </div>
  );
}

