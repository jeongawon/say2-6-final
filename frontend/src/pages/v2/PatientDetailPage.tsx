import { Fragment, useMemo, useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, FlaskConical, Image as ImageIcon, ChevronRight,
  CheckCircle2, Loader2, Sparkles, Stethoscope, PenLine, Wifi, WifiOff, X,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { ConfidenceBadge } from "../../components/v2/ConfidenceBadge";
import { PatientInfoSidebar } from "../../components/v2/PatientInfoSidebar";
import { findPatient, type DemoPatient } from "../../lib/v2/demoStore";
import { approveOrder, requestOrder, getModalHealth, type AIRec, type ModalKey } from "../../lib/v2/api";
import { useEncounterData } from "../../lib/v2/useEncounterData";
import { cn } from "../../lib/cn";

/* ─────────────────────────────────────────────────────────
   AI 분석 — "결정" 화면
   좌: 환자정보 / 중: AI 검사 권고(1·2·3차) / 우: 의사 직접 호출
   검사 결과·AI 판독은 'AI 결과' 페이지로 분리됨.
   ───────────────────────────────────────────────────────── */
export default function PatientDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const encounterId = searchParams.get("encounter_id");
  const nav = useNavigate();
  const patient = useMemo(() => findPatient(id), [id]);

  const { recs, serverOk, pendingNext, poll } = useEncounterData(encounterId);
  const [approving, setApproving] = useState<Set<string>>(new Set());

  async function handleApprove(srId: string) {
    setApproving((s) => new Set(s).add(srId));
    await approveOrder(srId);
    setTimeout(poll, 500);
    setTimeout(() => {
      setApproving((s) => { const n = new Set(s); n.delete(srId); return n; });
    }, 5000);
  }

  // 의사 직접 지시 — AI 권고와 무관하게 모달 검사 추가 실행
  const [requesting, setRequesting] = useState<Set<ModalKey>>(new Set());
  const [requested, setRequested] = useState<Set<ModalKey>>(new Set());
  async function handleRequestOrder(modality: ModalKey) {
    if (!encounterId) return;
    setRequested((s) => new Set(s).add(modality));
    setRequesting((s) => new Set(s).add(modality));
    await requestOrder(encounterId, patient?.fhirPatientId ?? encounterId, modality);
    setTimeout(poll, 500);
    setTimeout(() => {
      setRequesting((s) => { const n = new Set(s); n.delete(modality); return n; });
    }, 5000);
  }

  // 모달 추론 서버 실시간 상태 — /ops/health 폴링(15초). 의사가 토글 불가, 서버 끊기면 자동 "비활성".
  const [servers, setServers] = useState<Record<ModalKey, boolean>>({ ECG: true, CXR: true, LAB: true });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const h = await getModalHealth();
      if (alive && h) setServers({ ECG: !!h.ECG, CXR: !!h.CXR, LAB: !!h.LAB });
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const [manualOpen, setManualOpen] = useState<ModalKey | null>(null);
  const [manualDone, setManualDone] = useState<Set<ModalKey>>(new Set());

  const resultsHref = encounterId
    ? `/demo/patient/${id}/results?encounter_id=${encounterId}`
    : `/demo/patient/${id}/results`;

  if (!patient) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-20 text-center">
          <p className="text-slate-500 dark:text-vuno-muted">환자를 찾을 수 없습니다.</p>
        </div>
      </AppShell>
    );
  }

  const doneCount = recs.filter((r) => r.status === "completed").length;

  return (
    <AppShell notifications={3}>
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)] lg:grid lg:grid-cols-[390px_minmax(0,1fr)] lg:items-start">
        {/* ── 좌: 환자 정보 사이드바 (sticky 고정 — 옆 컨텐츠만 스크롤) ── */}
        <PatientInfoSidebar patient={patient} allowEdit className="lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto" />

        {/* ── 우측 컨텐츠: 검사 진행 흐름 + (좌 의사오더/메모 · 우 AI 1·2차) — 아래까지 채움 ── */}
        <div className="px-5 py-5 flex flex-col lg:min-h-[calc(100vh-3.5rem)]">
          <div className="flex flex-col gap-4 min-w-0 flex-1">
            {/* 상단: LIVE 검사 진행 흐름 바 (전체 폭 · 도킹 아님) */}
            <ExamFlowBar patient={patient} recs={recs} requested={requested} manualDone={manualDone} />
            {/* 양분: 좌 의사 직접 오더 · 우 AI 검사 권고 (현재 크기에 맞춰 채움) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch flex-1">
              <div className="flex flex-col min-w-0">
                <ManualOrderPanel
                  encounterId={encounterId}
                  recs={recs}
                  requesting={requesting}
                  requested={requested}
                  servers={servers}
                  manualDone={manualDone}
                  onRequestOrder={handleRequestOrder}
                  onManualOpen={(m) => setManualOpen(m)}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <AIRecPanel
                  patient={patient}
                  encounterId={encounterId}
                  recs={recs}
                  serverOk={serverOk}
                  pendingNext={pendingNext}
                  approving={approving}
                  doneCount={doneCount}
                  onApprove={handleApprove}
                  onOpenResults={() => nav(resultsHref)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 직접 입력 팝업 모달 */}
      {manualOpen && (
        <ManualInputModal
          modality={manualOpen}
          onClose={() => setManualOpen(null)}
          onSave={() => {
            setManualDone((s) => new Set(s).add(manualOpen));
            setManualOpen(null);
          }}
        />
      )}
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════
   중앙 — AI 권고 1·2·3차 패널
   ═══════════════════════════════════════════════════════════ */
const RANK_META: Record<1 | 2 | 3, { ko: string; badge: string; bar: string }> = {
  1: { ko: "1차 권고", badge: "bg-blue-600", bar: "bg-blue-50 border-blue-300 dark:bg-blue-500/15 dark:border-blue-500/40" },
  2: { ko: "2차 권고", badge: "bg-blue-600", bar: "bg-blue-50 border-blue-300 dark:bg-blue-500/15 dark:border-blue-500/40" },
  3: { ko: "3차 권고", badge: "bg-emerald-600", bar: "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/40" },
};

const MODAL_LABEL: Record<ModalKey, string> = {
  ECG: "심전도 12-Lead",
  CXR: "흉부 X-ray",
  LAB: "혈액 검사",
};

// 연동 전 데모용 AI 신뢰도 — srId 기반 안정적 값(1차 권고일수록 높음).
// 실연동 시 ServiceRequest의 confidence extension 값으로 대체.
function demoConfidence(rec: AIRec): number {
  let h = 0;
  for (const c of rec.srId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = rec.rank === 1 ? 90 : rec.rank === 2 ? 83 : 76;
  return base + (h % 8);
}

/* ═══════════════════════════════════════════════════════════
   상단 — LIVE 검사 진행 흐름 바 (ECG·CXR·LAB 스텝, 진행중 강조)
   ═══════════════════════════════════════════════════════════ */
type FlowStatus = "completed" | "active" | "draft" | "none";

function ExamFlowBar({ patient, recs, requested, manualDone }: {
  patient: DemoPatient;
  recs: AIRec[];
  requested: Set<ModalKey>;
  manualDone: Set<ModalKey>;
}) {
  const ALL: ModalKey[] = ["ECG", "CXR", "LAB"];

  const statusOf = (m: ModalKey): FlowStatus => {
    const rs = recs.filter((r) => r.modality === m);
    if (rs.length > 0) {
      if (rs.some((r) => r.status === "active")) return "active";
      if (rs.every((r) => r.status === "completed")) return "completed";
      if (rs.some((r) => r.status === "draft")) return "draft";
    }
    if (manualDone.has(m)) return "completed";       // 수기 입력 완료
    if (requested.has(m)) return "active";           // 의사 직접 지시 → 분석 중 (정적 완료보다 우선)
    // 폴백: 백엔드 미연동(showcase) 환자만 정적 데모 플래그 사용.
    // 백엔드 연동(recs 존재) 환자는 정적 done 무시 — 실제 오더/결과만 반영
    // (안 그러면 데모 환자의 cxr/lab="done"이 오더 안 했는데도 검사완료로 뜸).
    if (recs.length === 0) {
      const ps = patient[m.toLowerCase() as "ecg" | "cxr" | "lab"];
      if (ps === "done") return "completed";
    }
    return rs.length > 0 ? "draft" : "none";
  };

  // 호출 순서대로 슬롯 채우기 — recs는 이미 authoredOn 오름차순 정렬됨.
  // 모달별 최초 등장 순서 = 실제 호출(오더) 순서. 1차 AI 권고 실행이 1번,
  // 그 다음 2차 권고/의사 직접 오더가 2번·3번… 순으로 들어옴.
  // ECG·CXR·LAB 고정 표시. AI가 병렬 호출(예: 1차에 ECG+LAB)하면 각 모달이 동시에
  // 승인 대기로 뜬다 (모달별 독립 상태).
  const states = ALL.map((m) => ({ m, st: statusOf(m) }));
  const doneCount = states.filter((s) => s.st === "completed").length;
  const activeModal = states.find((s) => s.st === "active")?.m ?? null;
  const anyInvolved = states.some((s) => s.st !== "none");

  const phase =
    !anyInvolved ? "AI 검사 권고 대기 단계" :
    activeModal ? `${activeModal} 분석 진행 중…` :
    doneCount > 0 && states.every((s) => s.st === "completed" || s.st === "none") ? "검사 완료 — 종합소견 생성 단계" :
    states.some((s) => s.st === "draft") ? "검사 승인 대기 중" :
    "AI 검사 권고 검토 단계";

  return (
    <div className="flex-shrink-0 rounded-xl border border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface shadow-sm px-6 py-5">
      <div className="flex items-center gap-3 mb-5">
        <span className="h-11 w-11 grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-ai-accent text-white">
          <Activity className="h-6 w-6" />
        </span>
        <span className="text-[22px] font-bold text-slate-900 dark:text-white leading-none">검사 진행 상황</span>
        <span className="text-[15px] text-slate-500 dark:text-vuno-muted leading-none truncate">· {phase}</span>
        <span className="ml-auto text-[18px] font-bold font-numeric text-slate-500 dark:text-vuno-muted flex-shrink-0">{doneCount}/{ALL.length}</span>
      </div>
      <div className="flex items-start">
        {states.map(({ m, st }, i) => (
          <Fragment key={m}>
            <FlowStep modality={m} status={st} />
            {i < ALL.length - 1 && (
              <div className={cn(
                "flex-1 h-1 mt-[27px] rounded-full transition-colors",
                st === "completed" ? "bg-emerald-400 dark:bg-emerald-500/60" : "bg-slate-200 dark:bg-vuno-border",
              )} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function FlowStep({ modality, status }: { modality: ModalKey; status: FlowStatus }) {
  const Icon = modality === "ECG" ? Activity : modality === "CXR" ? ImageIcon : FlaskConical;
  // 호출(분석 중)이거나 승인 대기면 아이콘이 깜빡인다.
  const statusText =
    status === "completed" ? "검사 완료" :
    status === "active" ? "분석 중" :
    status === "draft" ? "승인 대기" : "";
  return (
    <div className="flex flex-col items-center gap-2 w-20 flex-shrink-0">
      <div className={cn(
        "relative h-14 w-14 grid place-items-center rounded-full border-2 transition-all",
        status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" :
        status === "active" ? "bg-amber-400 border-amber-400 text-white shadow-[0_0_0_5px_rgba(251,191,36,0.30)] scale-105 animate-pulse" :
        status === "draft" ? "bg-blue-500 border-blue-500 text-white shadow-[0_0_0_5px_rgba(59,130,246,0.28)] scale-105 animate-pulse" :
        "bg-slate-50 border-slate-200 text-slate-400 dark:bg-vuno-bg dark:border-vuno-border dark:text-vuno-dim",
      )}>
        {status === "active" && <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />}
        {status === "draft" && <span className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping" />}
        {status === "completed" ? <CheckCircle2 className="h-7 w-7 relative" /> : <Icon className="h-6 w-6 relative" />}
      </div>
      <div className="text-center leading-none">
        <div className={cn("text-[15px] font-bold leading-none", status === "none" ? "text-slate-500 dark:text-vuno-muted" : "text-slate-800 dark:text-white")}>{modality}</div>
        <div className={cn(
          "text-[11px] mt-1.5 font-bold leading-none",
          status === "completed" ? "text-emerald-600 dark:text-emerald-300" :
          status === "active" ? "text-amber-600 dark:text-amber-300" :
          status === "draft" ? "text-blue-600 dark:text-blue-300" :
          "text-slate-400 dark:text-vuno-dim",
        )}>{statusText || " "}</div>
      </div>
    </div>
  );
}

function AIRecPanel({
  patient, encounterId, recs, serverOk, pendingNext, approving, doneCount, onApprove, onOpenResults,
}: {
  patient: DemoPatient;
  encounterId: string | null;
  recs: AIRec[];
  serverOk: boolean;
  pendingNext: boolean;
  approving: Set<string>;
  doneCount: number;
  onApprove: (srId: string) => void;
  onOpenResults: () => void;
}) {
  // ('모든 권장 검사 완료' 배너는 제거됨 — 사용자 요청. 종합소견 생성은 하단 버튼으로 안내.)
  // 백엔드 미연동 — 정적 demoStore recommendation 폴백
  if (!encounterId) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden">
        <PanelHeader serverOk={serverOk} />
        <div className="flex-1 overflow-auto p-4">
          {patient.recommendation ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-vuno-muted bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border rounded-lg px-2.5 py-2">
                데모 모드 — 백엔드 미연동. 실제 AI 권고 시계열은 트리아지 제출로 encounter를 생성하면 표시됩니다.
              </div>
              <div className="border border-slate-200 dark:border-vuno-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[13px] font-bold text-slate-800 dark:text-white">
                    {patient.recommendation.diagnosis}
                  </div>
                  <ConfidenceBadge value={88 + (patient.recommendation.diagnosis.length % 9)} className="ml-auto" />
                </div>
                <div className="text-[9px] font-bold tracking-wide text-brand-600 dark:text-brand-300 mb-1">AI 근거</div>
                {patient.recommendation.reasons.map((r) => (
                  <div key={r} className="text-[12px] text-slate-600 dark:text-vuno-muted leading-relaxed">· {r}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-[15px] font-medium text-slate-400 dark:text-vuno-dim">AI 권고 없음</div>
          )}
        </div>
        <PanelFooter onOpenResults={onOpenResults} disabled />
      </div>
    );
  }

  const aiRecs = recs.filter((r) => !r.isManual);
  const manualRecs = recs.filter((r) => r.isManual);

  // AI 권고 rank별 그룹
  const byRank = new Map<1 | 2 | 3, AIRec[]>();
  aiRecs.forEach((r) => {
    const arr = byRank.get(r.rank) ?? [];
    arr.push(r);
    byRank.set(r.rank, arr);
  });
  const ranks = [...byRank.keys()].sort();
  // 게이팅: 2차/3차 권고는 '이전 차수의 모든 검사가 완료'된 경우에만 표시한다.
  // (2차 권고는 1차 검사 결과를 바탕으로 나와야 하므로, 1차 미완료 시 숨김.)
  const visibleRanks: (1 | 2 | 3)[] = [];
  for (const rank of ranks) {
    const priorDone = ranks
      .filter((r) => r < rank)
      .every((r) => byRank.get(r)!.every((rec) => rec.status === "completed"));
    if (priorDone) visibleRanks.push(rank);
    else break; // 한 차수라도 미완료면 그 이후 차수는 모두 숨김
  }
  // allDone 은 위에서 디바운스된 state (2차 재판단 깜빡임 방지)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden">
      <PanelHeader serverOk={serverOk} />

      {recs.length === 0 ? (
        <div className="flex-1 py-16 flex flex-col items-center justify-center text-center text-[15px] font-medium text-slate-400 dark:text-vuno-dim">
          <Loader2 className="h-7 w-7 mb-2.5 animate-spin text-slate-300 dark:text-vuno-dim" />
          AI 권고를 불러오는 중…
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* AI 1·2·3차 권고 — 세로로 차곡차곡 (폭 제한 컨텐츠) */}
          <div className="space-y-3">
          {visibleRanks.map((rank) => {
            const rm = RANK_META[rank];
            return (
              <div key={rank} className={cn("border rounded-lg overflow-hidden", rm.bar)}>
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-black/5 dark:border-white/10">
                  <Sparkles className="h-4 w-4 text-brand-600 flex-shrink-0" />
                  <span className={cn("px-2.5 py-1 rounded text-[13px] font-bold text-white", rm.badge)}>
                    {rm.ko}
                  </span>
                  <span className="text-[12px] text-slate-500 dark:text-vuno-muted font-medium">
                    판단 근거 기반 · 검사 {byRank.get(rank)!.length}건
                  </span>
                  <ConfidenceBadge value={Math.max(...byRank.get(rank)!.map((r) => demoConfidence(r)))} uniform size="lg" className="ml-auto flex-shrink-0" />
                </div>
                <div className="p-3 space-y-2.5 bg-white dark:bg-vuno-surface">
                  {byRank.get(rank)!.map((rec) => (
                    <RecRow
                      key={rec.srId}
                      rec={rec}
                      approving={approving.has(rec.srId)}
                      onApprove={() => onApprove(rec.srId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          </div>

          {/* 의사 직접 지시 진행 상태 (우측 패널에서 호출한 검사) — 1·2차 권고 박스와 동일 크기 */}
          {manualRecs.length > 0 && (
            <div className="border border-slate-300 dark:border-vuno-border rounded-lg overflow-hidden bg-slate-50 dark:bg-vuno-bg">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-300 dark:border-vuno-border">
                <Stethoscope className="h-4 w-4 text-slate-700 dark:text-slate-200 flex-shrink-0" />
                <span className="px-2.5 py-1 rounded text-[13px] font-bold text-white bg-slate-700">
                  의사 직접 지시
                </span>
                <span className="text-[12px] text-slate-500 dark:text-vuno-muted font-medium">
                  의사 판단 · 검사 {manualRecs.length}건
                </span>
              </div>
              <div className="p-3 space-y-2.5 bg-white dark:bg-vuno-surface">
                {manualRecs.map((rec) => (
                  <RecRow
                    key={rec.srId}
                    rec={rec}
                    approving={approving.has(rec.srId)}
                    onApprove={() => onApprove(rec.srId)}
                    manual
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <PanelFooter onOpenResults={onOpenResults} disabled={doneCount === 0} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   좌측 — 의사 직접 지시 (AI 권고와 별개로 모달 검사 지시) + 의사 메모
   ═══════════════════════════════════════════════════════════ */
function ManualOrderPanel({
  encounterId, recs, requesting, requested, servers, manualDone, onRequestOrder, onManualOpen,
}: {
  encounterId: string | null;
  recs: AIRec[];
  requesting: Set<ModalKey>;
  requested: Set<ModalKey>;
  servers: Record<ModalKey, boolean>;
  manualDone: Set<ModalKey>;
  onRequestOrder: (m: ModalKey) => void;
  onManualOpen: (m: ModalKey) => void;
}) {
  const ALL: ModalKey[] = ["ECG", "CXR", "LAB"];
  // AI가 권고한 모달은 'AI 검사 권고' 탭에서 관리 → 의사 직접 지시 탭엔 표시하지 않음.
  const aiMods = new Set(recs.filter((r) => !r.isManual).map((r) => r.modality));
  const shown = ALL.filter((m) => !aiMods.has(m));
  const [memo, setMemo] = useState("");
  return (
    <div className="h-full flex flex-col bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2.5">
        <span className="h-9 w-9 grid place-items-center rounded-lg bg-slate-700 text-white">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div className="text-[16px] font-bold text-slate-900 dark:text-white leading-none">의사 직접 지시</div>
      </div>

      {/* 모달 지시 — 가장 강조되는 영역 (큰 행·넓은 간격, 자연 높이) */}
      <div className="p-4 space-y-3.5">
        {shown.length === 0 ? (
          <div className="text-[13px] text-slate-400 dark:text-vuno-dim text-center py-5">
            모든 검사가 AI 권고에 포함되어 있습니다.
          </div>
        ) : shown.map((m) => (
          <ManualOrderRow
            key={m}
            modality={m}
            rec={recs.find((r) => r.modality === m)}
            loading={requesting.has(m)}
            requested={requested.has(m)}
            disabled={!encounterId}
            serverUp={servers[m]}
            manualDone={manualDone.has(m)}
            onOrder={() => onRequestOrder(m)}
            onManualOpen={() => onManualOpen(m)}
          />
        ))}
      </div>

      {/* 의사 메모 — 하단 보조 영역 (글자 크기는 유지, 높이만 고정해 모달 지시 영역을 강조) */}
      <div className="px-5 pt-3 pb-2 border-t border-slate-200 dark:border-vuno-border flex items-center gap-2">
        <PenLine className="h-[18px] w-[18px] text-slate-500 dark:text-vuno-muted" />
        <div className="text-[16px] font-bold text-slate-900 dark:text-white">의사 메모</div>
        <span className="ml-auto text-[13px] text-slate-400 dark:text-vuno-dim">자동 저장</span>
      </div>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="처치 경과 · 인계사항 · 환자 특이사항을 입력하세요"
        className="flex-1 min-h-[140px] w-full px-5 py-3 text-[15px] leading-relaxed bg-transparent text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-vuno-dim focus:outline-none resize-none"
      />
    </div>
  );
}

function ManualOrderRow({
  modality, rec, loading, requested, disabled, serverUp, manualDone, onOrder, onManualOpen,
}: {
  modality: ModalKey;
  rec?: AIRec;
  loading: boolean;
  requested: boolean;
  disabled: boolean;
  serverUp: boolean;
  manualDone: boolean;
  onOrder: () => void;
  onManualOpen: () => void;
}) {
  const Icon = modality === "ECG" ? Activity : modality === "CXR" ? ImageIcon : FlaskConical;
  const done = rec?.status === "completed";
  const running = rec?.status === "active";
  const requesting = loading || (requested && !rec);
  const doneVisual = done || manualDone;

  return (
    <div className={cn(
      "border rounded-xl px-4 py-3.5 transition-colors flex items-center gap-3",
      doneVisual ? "border-emerald-300 bg-emerald-100/80 dark:border-emerald-500/50 dark:bg-emerald-500/25" :
      (running || requesting) ? "border-amber-300 bg-amber-100/80 dark:border-amber-500/50 dark:bg-amber-500/25" :
      !serverUp ? "border-red-200 bg-red-50/50 dark:border-red-500/40 dark:bg-red-500/15" :
      "border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface",
    )}>
      <span className={cn(
        "h-11 w-11 grid place-items-center rounded-lg flex-shrink-0",
        doneVisual ? "bg-emerald-200 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200" :
        (running || requesting) ? "bg-amber-200 text-amber-700 dark:bg-amber-500/25 dark:text-amber-200" :
        "bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted",
      )}>
        <Icon className="h-6 w-6" />
      </span>
      {/* 이름 + 라벨 직렬 */}
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="text-[17px] font-bold text-slate-800 dark:text-white">{modality}</span>
        <span className="text-[13px] text-slate-400 dark:text-vuno-dim truncate">{MODAL_LABEL[modality]}</span>
      </div>
      {/* 서버 상태 배너 (실시간 · 읽기 전용) — 서버 끊기면 자동 비활성 */}
      <span
        title="모달 추론 서버 실시간 상태 (서버 끊기면 자동 비활성)"
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border flex-shrink-0",
          serverUp
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
            : "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",
        )}
      >
        {serverUp ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {serverUp ? "활성" : "비활성"}
      </span>
      {/* 액션 직렬 — 검사 지시 / 분석 중 / 검사 완료 / (비활성 시) 직접 입력 */}
      {manualDone ? (
        <button onClick={onManualOpen} className="h-9 px-3 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 transition-colors flex-shrink-0">
          <CheckCircle2 className="h-4 w-4" /> 수기 완료
        </button>
      ) : done ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-bold bg-emerald-200/70 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200 flex-shrink-0">
          <CheckCircle2 className="h-4 w-4" /> 검사 완료
        </span>
      ) : running || requesting ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-bold bg-amber-200/70 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200 flex-shrink-0">
          <Loader2 className="h-4 w-4 animate-spin" /> 분석 중
        </span>
      ) : !serverUp ? (
        <button onClick={onManualOpen} className="h-9 px-3 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 bg-slate-800 text-white hover:bg-slate-900 dark:bg-brand-600 dark:hover:bg-brand-700 transition-colors flex-shrink-0">
          <PenLine className="h-4 w-4" /> 직접 입력
        </button>
      ) : (
        <button
          onClick={onOrder}
          disabled={disabled}
          title={disabled ? "encounter 생성 후 지시 가능 (트리아지 제출)" : "AI 권고와 별개로 의사가 직접 검사를 지시합니다"}
          className="h-9 px-3.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-vuno-bg dark:disabled:text-vuno-dim disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <Stethoscope className="h-4 w-4" /> 검사 지시
        </button>
      )}
    </div>
  );
}

/* ── 직접 입력 팝업 모달 (추론 서버 OFF 시 의사 수기 입력) ── */
function ManualInputModal({ modality, onClose, onSave }: {
  modality: ModalKey; onClose: () => void; onSave: () => void;
}) {
  const [findings, setFindings] = useState("");
  const [ecg, setEcg] = useState({ hr: "", pr: "", qrs: "", qt: "" });
  const inputCls = "w-full h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white text-sm focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-vuno-surface rounded-xl shadow-xl border border-slate-200 dark:border-vuno-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-ai-accent text-white flex items-center gap-2">
          <PenLine className="h-4 w-4" />
          <div className="text-[15px] font-bold leading-none">{modality} 직접 입력</div>
          <span className="text-[11px] text-white/80">{MODAL_LABEL[modality]}</span>
          <button onClick={onClose} className="ml-auto h-7 w-7 grid place-items-center rounded-lg hover:bg-white/15 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/40 rounded-lg px-2.5 py-2">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" /> 추론 서버 OFF — 의사 수기 입력으로 기록됩니다.
          </div>

          {modality === "ECG" && (
            <div className="grid grid-cols-2 gap-2">
              {([["hr", "HR (bpm)"], ["pr", "PR int (ms)"], ["qrs", "QRS (ms)"], ["qt", "QT int (ms)"]] as const).map(([k, lbl]) => (
                <div key={k}>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-vuno-muted">{lbl}</label>
                  <input
                    type="number" inputMode="decimal"
                    value={ecg[k]}
                    onChange={(e) => setEcg((s) => ({ ...s, [k]: e.target.value }))}
                    className={cn(inputCls, "mt-1 font-numeric")}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-vuno-muted">
              판독 소견 {modality === "LAB" ? "· 주요 수치" : ""}
            </label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              rows={4}
              placeholder={
                modality === "ECG" ? "예: 동율동, ST 변화 없음" :
                modality === "CXR" ? "예: 폐 침윤 없음, 심장 음영 정상" :
                "예: Troponin I 0.82 ↑↑, WBC 10.2"
              }
              className={cn(inputCls, "h-auto py-2 resize-none mt-1 placeholder:text-slate-300 dark:placeholder:text-vuno-dim")}
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-vuno-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 dark:border-vuno-border text-slate-600 dark:text-vuno-muted hover:bg-slate-50 dark:hover:bg-vuno-elevated text-[13px] font-bold transition-colors">
            취소
          </button>
          <button
            onClick={onSave}
            disabled={!findings.trim()}
            className="h-9 px-4 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-vuno-bg dark:disabled:text-vuno-dim disabled:cursor-not-allowed text-[13px] font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ serverOk }: { serverOk: boolean }) {
  return (
    <div className="px-5 py-3.5 border-b border-slate-200 dark:border-vuno-border bg-brand-50 dark:bg-brand-500/15 flex items-center gap-2.5">
      <span className="h-9 w-9 grid place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-ai-accent text-white">
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="text-[16px] font-bold text-slate-900 dark:text-white leading-none">AI 검사 권고</div>
      {/* 중앙 서버 상태 — REST 응답 여부 기준. 끊기면 자동 OFF (의사 토글 불가) */}
      <span
        title="중앙 서버 상태 (응답 끊기면 자동 OFF)"
        className={cn(
          "ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border flex-shrink-0",
          serverOk
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
            : "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",
        )}
      >
        {serverOk ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {serverOk ? "ON" : "OFF"}
      </span>
    </div>
  );
}

function PanelFooter({ onOpenResults, disabled }: { onOpenResults: () => void; disabled?: boolean }) {
  return (
    <div className="p-3.5 border-t border-slate-200 dark:border-vuno-border space-y-1.5">
      <button
        onClick={onOpenResults}
        disabled={disabled}
        title={disabled ? "검사가 완료되면 결과를 볼 수 있습니다" : ""}
        className={cn(
          "w-full h-12 rounded-lg text-[15px] font-bold inline-flex items-center justify-center gap-2 transition-colors",
          disabled
            ? "bg-slate-200 dark:bg-vuno-bg text-slate-400 dark:text-vuno-dim cursor-not-allowed"
            : "bg-brand-600 text-white hover:bg-brand-700",
        )}
      >
        {disabled ? "검사 진행 중 — 결과 대기" : "AI 결과 보기"}
        {!disabled && <ChevronRight className="h-5 w-5" />}
      </button>
    </div>
  );
}

function RecRow({ rec, approving, onApprove, manual }: { rec: AIRec; approving: boolean; onApprove: () => void; manual?: boolean }) {
  const Icon = rec.modality === "ECG" ? Activity : rec.modality === "CXR" ? ImageIcon : FlaskConical;
  const isDraft = rec.status === "draft" && !approving;
  const isRunning = approving || rec.status === "active";
  const isDone = rec.status === "completed";

  return (
    <div className={cn(
      "border rounded-lg px-3.5 py-3",
      isDone ? "border-emerald-300 bg-emerald-100/80 dark:border-emerald-500/50 dark:bg-emerald-500/25" :
      isRunning ? "border-amber-300 bg-amber-100/80 dark:border-amber-500/50 dark:bg-amber-500/25" :
      manual ? "border-slate-300 bg-slate-50/60 dark:border-vuno-border dark:bg-vuno-bg" :
      "border-slate-200 dark:border-vuno-border",
    )}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className={cn(
          "h-9 w-9 grid place-items-center rounded-lg flex-shrink-0",
          isDone ? "bg-emerald-200 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200" :
          isRunning ? "bg-amber-200 text-amber-700 dark:bg-amber-500/25 dark:text-amber-200" :
          manual ? "bg-slate-200 text-slate-700 dark:bg-vuno-bg dark:text-slate-200" :
          "bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted",
        )}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-[17px] font-bold text-slate-800 dark:text-white leading-none">{rec.modality}</span>
          <span className="text-[14px] text-slate-400 dark:text-vuno-dim leading-none truncate">{MODAL_LABEL[rec.modality]}</span>
        </div>
        <span className="ml-auto">
          {isDone ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold bg-emerald-200/70 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" /> 검사 완료
            </span>
          ) : isRunning ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold bg-amber-200/70 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200">
              <Loader2 className="h-4 w-4 animate-spin" /> 분석 중
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 animate-pulse">
              승인 대기
            </span>
          )}
        </span>
      </div>
      {manual ? (
        rec.reason && (
          <div className="text-[15px] text-slate-600 dark:text-vuno-muted leading-relaxed mb-2.5">{rec.reason}</div>
        )
      ) : (
        <div className="mb-2.5">
          <div className="text-[13px] font-bold tracking-wide text-brand-600 dark:text-brand-300 mb-1.5">판단 근거</div>
          <div className="text-[16px] text-slate-700 dark:text-slate-200 leading-relaxed">
            {rec.reason || "환자 주호소·활력징후 분석 기반 권고"}
          </div>
        </div>
      )}
      {isDraft && (
        <button
          onClick={onApprove}
          className="w-full h-12 rounded-lg bg-slate-800 text-white text-[15px] font-bold hover:bg-slate-900 dark:bg-brand-600 dark:hover:bg-brand-700 inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <CheckCircle2 className="h-5 w-5" /> 검사 실행
        </button>
      )}
      {isDone && (
        <div className="text-[12px] text-emerald-600 dark:text-emerald-300 font-medium">→ AI 결과 페이지에서 판독 확인</div>
      )}
    </div>
  );
}
