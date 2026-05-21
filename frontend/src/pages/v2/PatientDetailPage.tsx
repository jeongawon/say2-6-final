import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, FlaskConical, Image as ImageIcon, ChevronRight,
  CheckCircle2, Loader2, Sparkles, Stethoscope, Zap, PenLine, Wifi, WifiOff, X,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { findPatient, type DemoPatient } from "../../lib/v2/demoStore";
import { approveOrder, requestOrder, type AIRec, type ModalKey } from "../../lib/v2/api";
import { PatientInfoSidebar } from "../../components/v2/PatientInfoSidebar";
import { LiveBadge } from "../../components/v2/LiveBadge";
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

  const { recs, wsStatus, poll } = useEncounterData(encounterId);
  const [approving, setApproving] = useState<Set<string>>(new Set());

  async function handleApprove(srId: string) {
    setApproving((s) => new Set(s).add(srId));
    await approveOrder(srId);
    setTimeout(poll, 500);
    setTimeout(() => {
      setApproving((s) => { const n = new Set(s); n.delete(srId); return n; });
    }, 5000);
  }

  // 의사 직접 오더 — AI 권고와 무관하게 모달 검사 추가 실행
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

  // 모달 추론 서버 ON/OFF (목업 — 배포 후 /ops/health 연동). 칩 클릭으로 데모 토글.
  const [servers, setServers] = useState<Record<ModalKey, boolean>>({ ECG: true, CXR: true, LAB: true });
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
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)]">
        <div className="max-w-[1600px] mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-[300px_1fr_1fr] gap-5 items-stretch min-h-[calc(100vh-3.5rem)]">
          {/* ── 좌: 환자 정보 ── */}
          <PatientInfoSidebar patient={patient} />

          {/* ── 중: AI 검사 권고 ── */}
          <AIRecPanel
            patient={patient}
            encounterId={encounterId}
            recs={recs}
            wsStatus={wsStatus}
            approving={approving}
            doneCount={doneCount}
            onApprove={handleApprove}
            onOpenResults={() => nav(resultsHref)}
          />

          {/* ── 우: 의사 직접 호출 ── */}
          <ManualOrderPanel
            encounterId={encounterId}
            recs={recs}
            requesting={requesting}
            requested={requested}
            servers={servers}
            manualDone={manualDone}
            onRequestOrder={handleRequestOrder}
            onToggleServer={(m) => setServers((s) => ({ ...s, [m]: !s[m] }))}
            onManualOpen={(m) => setManualOpen(m)}
          />
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
  1: { ko: "1차 권고", badge: "bg-purple-600", bar: "bg-purple-50 border-purple-300 dark:bg-purple-500/15 dark:border-purple-500/40" },
  2: { ko: "2차 권고", badge: "bg-blue-600", bar: "bg-blue-50 border-blue-300 dark:bg-blue-500/15 dark:border-blue-500/40" },
  3: { ko: "3차 권고", badge: "bg-emerald-600", bar: "bg-emerald-50 border-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/40" },
};

const MODAL_LABEL: Record<ModalKey, string> = {
  ECG: "심전도 12-Lead",
  CXR: "흉부 X-ray",
  LAB: "혈액 검사",
};

function AIRecPanel({
  patient, encounterId, recs, wsStatus, approving, doneCount, onApprove, onOpenResults,
}: {
  patient: DemoPatient;
  encounterId: string | null;
  recs: AIRec[];
  wsStatus: "open" | "close" | "error" | null;
  approving: Set<string>;
  doneCount: number;
  onApprove: (srId: string) => void;
  onOpenResults: () => void;
}) {
  // 백엔드 미연동 — 정적 demoStore recommendation 폴백
  if (!encounterId) {
    return (
      <div className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
        <PanelHeader wsStatus={wsStatus} />
        <div className="flex-1 overflow-auto p-4">
          {patient.recommendation ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-vuno-muted bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border rounded-lg px-2.5 py-2">
                데모 모드 — 백엔드 미연동. 실제 AI 권고 시계열은 트리아지 제출로 encounter를 생성하면 표시됩니다.
              </div>
              <div className="border border-slate-200 dark:border-vuno-border rounded-lg p-3">
                <div className="text-[13px] font-bold text-slate-800 dark:text-white mb-1.5">
                  {patient.recommendation.diagnosis}
                </div>
                {patient.recommendation.reasons.map((r) => (
                  <div key={r} className="text-[12px] text-slate-600 dark:text-vuno-muted leading-relaxed">· {r}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-vuno-dim">AI 권고 없음</div>
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
  const allDraft = recs.filter((r) => r.status === "draft");
  const allDone = recs.length > 0 && recs.every((r) => r.status === "completed");

  return (
    <div className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
      <PanelHeader wsStatus={wsStatus} />

      {recs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-400 dark:text-vuno-dim">
          <Loader2 className="h-6 w-6 mb-2 animate-spin text-slate-300 dark:text-vuno-dim" />
          AI 권고를 불러오는 중…
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* AI 1·2·3차 권고 */}
          {ranks.map((rank) => {
            const rm = RANK_META[rank];
            return (
              <div key={rank} className={cn("border rounded-lg overflow-hidden", rm.bar)}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-black/5 dark:border-white/10">
                  <Sparkles className="h-3 w-3 text-brand-600" />
                  <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold text-white", rm.badge)}>
                    {rm.ko}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-vuno-muted font-medium">
                    AI 분석 기반 · 검사 {byRank.get(rank)!.length}건
                  </span>
                </div>
                <div className="p-2.5 space-y-2 bg-white dark:bg-vuno-surface">
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

          {/* 의사 직접 오더 진행 상태 (우측 패널에서 호출한 검사) */}
          {manualRecs.length > 0 && (
            <div className="border border-slate-300 dark:border-vuno-border rounded-lg overflow-hidden bg-slate-50 dark:bg-vuno-bg">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-300 dark:border-vuno-border">
                <Stethoscope className="h-3.5 w-3.5 text-slate-700 dark:text-slate-200" />
                <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white bg-slate-700">
                  의사 직접 오더
                </span>
                <span className="text-[11px] text-slate-500 dark:text-vuno-muted font-medium">
                  의사 판단 · 검사 {manualRecs.length}건
                </span>
              </div>
              <div className="p-2.5 space-y-2 bg-white dark:bg-vuno-surface">
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

          {/* 모든 권고 완료 */}
          {allDone && (
            <div className="border border-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 dark:border-emerald-500/40 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300">모든 권장 검사 완료</div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug mt-0.5">
                  AI 결과 페이지에서 판독을 확인하고 종합 소견서를 생성할 수 있습니다.
                </div>
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
   우측 — 의사 직접 호출 패널 (AI 권고와 별개로 모달 검사 지시)
   ═══════════════════════════════════════════════════════════ */
function ManualOrderPanel({
  encounterId, recs, requesting, requested, servers, manualDone, onRequestOrder, onToggleServer, onManualOpen,
}: {
  encounterId: string | null;
  recs: AIRec[];
  requesting: Set<ModalKey>;
  requested: Set<ModalKey>;
  servers: Record<ModalKey, boolean>;
  manualDone: Set<ModalKey>;
  onRequestOrder: (m: ModalKey) => void;
  onToggleServer: (m: ModalKey) => void;
  onManualOpen: (m: ModalKey) => void;
}) {
  const ALL: ModalKey[] = ["ECG", "CXR", "LAB"];
  const anyDown = ALL.some((m) => !servers[m]);
  return (
    <div className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2">
        <span className="h-8 w-8 grid place-items-center rounded-lg bg-slate-700 text-white">
          <Stethoscope className="h-4 w-4" />
        </span>
        <div>
          <div className="text-base font-bold text-slate-900 dark:text-white leading-none">의사 직접 호출</div>
          <div className="text-[10px] text-slate-400 dark:text-vuno-dim tracking-wider uppercase mt-0.5">Manual Order</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        <p className="text-[11px] text-slate-500 dark:text-vuno-muted leading-snug px-0.5">
          AI 권고와 별개로, 의사 판단에 따라 검사를 직접 지시합니다.
        </p>
        {anyDown && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/40 rounded-lg px-2.5 py-2">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" /> 추론 서버가 꺼진 검사는 의사가 직접 입력할 수 있습니다.
          </div>
        )}
        {ALL.map((m) => (
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
            onToggleServer={() => onToggleServer(m)}
            onManualOpen={() => onManualOpen(m)}
          />
        ))}
      </div>
    </div>
  );
}

function ManualOrderRow({
  modality, rec, loading, requested, disabled, serverUp, manualDone, onOrder, onToggleServer, onManualOpen,
}: {
  modality: ModalKey;
  rec?: AIRec;
  loading: boolean;
  requested: boolean;
  disabled: boolean;
  serverUp: boolean;
  manualDone: boolean;
  onOrder: () => void;
  onToggleServer: () => void;
  onManualOpen: () => void;
}) {
  const Icon = modality === "ECG" ? Activity : modality === "CXR" ? ImageIcon : FlaskConical;
  const done = rec?.status === "completed";
  const running = rec?.status === "active";
  const requesting = loading || (requested && !rec);
  const ordered = !!rec || requested;

  return (
    <div className={cn(
      "border rounded-lg px-3 py-2.5 transition-colors",
      manualDone ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/40 dark:bg-emerald-500/15" :
      !serverUp ? "border-red-200 bg-red-50/40 dark:border-red-500/40 dark:bg-red-500/15" :
      "border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface",
    )}>
      {/* 상단: 아이콘 + 이름 + 서버 ON/OFF 칩 */}
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 grid place-items-center rounded-lg flex-shrink-0 bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-slate-800 dark:text-white leading-none">{modality}</div>
          <div className="text-[10px] text-slate-400 dark:text-vuno-dim mt-0.5">{MODAL_LABEL[modality]}</div>
        </div>
        <button
          onClick={onToggleServer}
          title="추론 서버 상태 (데모 — 클릭해서 ON/OFF 전환)"
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors",
            serverUp
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
              : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-vuno-bg dark:text-vuno-muted dark:border-vuno-border",
          )}
        >
          {serverUp ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {serverUp ? "ON" : "OFF"}
        </button>
      </div>

      {/* 하단: 액션 */}
      <div className="mt-2 flex justify-end">
        {manualDone ? (
          <button
            onClick={onManualOpen}
            className="h-8 px-3 rounded-lg text-[12px] font-bold inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> 수기 입력 완료 · 수정
          </button>
        ) : !serverUp ? (
          <button
            onClick={onManualOpen}
            className="h-8 px-3 rounded-lg text-[12px] font-bold inline-flex items-center gap-1 bg-slate-800 text-white hover:bg-slate-900 dark:bg-brand-600 dark:hover:bg-brand-700 transition-colors"
          >
            <PenLine className="h-3.5 w-3.5" /> 직접 입력
          </button>
        ) : done ? (
          <span className="px-2 py-1 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓ 완료</span>
        ) : running || requesting ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" /> {running ? "분석 중" : "요청 중"}
          </span>
        ) : ordered ? (
          <span className="px-2 py-1 rounded text-[11px] font-bold bg-slate-100 text-slate-500 dark:bg-vuno-bg dark:text-vuno-muted">오더됨</span>
        ) : (
          <button
            onClick={onOrder}
            disabled={disabled}
            title={disabled ? "encounter 생성 후 호출 가능 (트리아지 제출)" : ""}
            className="h-8 px-3 rounded-lg text-[12px] font-bold inline-flex items-center gap-1 bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-vuno-bg dark:disabled:text-vuno-dim disabled:cursor-not-allowed transition-colors"
          >
            <Zap className="h-3.5 w-3.5" /> AI 호출
          </button>
        )}
      </div>
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

function PanelHeader({ wsStatus }: { wsStatus: "open" | "close" | "error" | null }) {
  return (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-vuno-border bg-brand-50 dark:bg-brand-500/15 flex items-center gap-2">
      <span className="h-8 w-8 grid place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-ai-accent text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <div className="text-base font-bold text-slate-900 dark:text-white leading-none">AI 검사 권고</div>
        <div className="text-[10px] text-slate-400 dark:text-vuno-dim tracking-wider uppercase mt-0.5">AI Recommendations · 1·2·3차</div>
      </div>
      <LiveBadge status={wsStatus} className="ml-auto" />
    </div>
  );
}

function PanelFooter({ onOpenResults, disabled }: { onOpenResults: () => void; disabled?: boolean }) {
  return (
    <div className="p-3 border-t border-slate-200 dark:border-vuno-border space-y-1.5">
      <button
        onClick={onOpenResults}
        disabled={disabled}
        title={disabled ? "검사가 완료되면 결과를 볼 수 있습니다" : ""}
        className={cn(
          "w-full h-11 rounded-lg text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-colors",
          disabled
            ? "bg-slate-200 dark:bg-vuno-bg text-slate-400 dark:text-vuno-dim cursor-not-allowed"
            : "bg-brand-600 text-white hover:bg-brand-700",
        )}
      >
        {disabled ? "검사 진행 중 — 결과 대기" : "AI 결과 보기"}
        {!disabled && <ChevronRight className="h-4 w-4" />}
      </button>
      {disabled && (
        <button
          onClick={onOpenResults}
          className="w-full h-8 rounded-lg text-[11px] font-bold text-slate-600 dark:text-vuno-muted border border-slate-300 dark:border-vuno-border hover:bg-slate-50 dark:hover:bg-vuno-elevated inline-flex items-center justify-center gap-1.5"
        >
          결과 페이지 미리 열기 →
        </button>
      )}
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
      "border rounded-lg px-2.5 py-2",
      isDone ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/40 dark:bg-emerald-500/15" :
      isRunning ? "border-amber-200 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-500/15" :
      manual ? "border-slate-300 bg-slate-50/60 dark:border-vuno-border dark:bg-vuno-bg" :
      "border-slate-200 dark:border-vuno-border",
    )}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn(
          "h-6 w-6 grid place-items-center rounded flex-shrink-0",
          isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" :
          isRunning ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
          manual ? "bg-slate-200 text-slate-700 dark:bg-vuno-bg dark:text-slate-200" :
          "bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted",
        )}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-800 dark:text-white leading-none">{rec.modality}</div>
          <div className="text-[9px] text-slate-400 dark:text-vuno-dim mt-0.5">{MODAL_LABEL[rec.modality]}</div>
        </div>
        <span className="ml-auto">
          {isDone ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> 완료
            </span>
          ) : isRunning ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" /> 분석 중
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
              승인 대기
            </span>
          )}
        </span>
      </div>
      {rec.reason && (
        <div className="text-[10px] text-slate-500 dark:text-vuno-muted leading-snug mb-1.5 line-clamp-2">{rec.reason}</div>
      )}
      {isDraft && (
        <button
          onClick={onApprove}
          className="w-full h-8 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-900 dark:bg-brand-600 dark:hover:bg-brand-700 inline-flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> 검사 실행
        </button>
      )}
      {isDone && (
        <div className="text-[10px] text-emerald-600 dark:text-emerald-300 font-medium">→ AI 결과 페이지에서 판독 확인</div>
      )}
    </div>
  );
}
