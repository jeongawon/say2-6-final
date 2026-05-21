import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ChevronLeft, ChevronRight, Clock, Loader2, CheckCircle2, Activity,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { getAllPatients, isLivePatient, getLocalReportStatus, type DemoPatient } from "../../lib/v2/demoStore";
import { listReports, type ReportStatus as BackendReportStatus } from "../../lib/v2/api";
import { KTAS_META, type KTAS } from "../../types/triage";
import { fmtTime } from "../../components/v2/PatientInfoSidebar";
import { cn } from "../../lib/cn";

/* ─────────────────────────────────────────────────────────
   say-6 환자 목록 — 조회 필터 · 환자 테이블 · 검사 진행 현황
   ───────────────────────────────────────────────────────── */

type SoGyeon = "all" | "done" | "review" | "signed";
type KtasFilter = "all" | KTAS;
type ExamStatus = "waiting" | "inProgress" | "done";
const PAGE_SIZE = 15;

function regNo(p: DemoPatient): string {
  return p.mimic?.subject_id ?? p.mrn ?? p.id.slice(0, 8);
}
// 우선순위: 백엔드 diagnostic_reports.status → 로컬 캐시(데모 환자) → demoStore 추정.
// 단, "작성 가능(done)"·"검토 중(review)"은 AI 분석이 완료된 경우에만 표시.
// (ReportEditorPage 가 마운트만 해도 "preliminary"를 캐시하는 leak 방어)
//
// backend Map은 두 가지 키로 동시 등록:
//   · encounter_id 그대로 (라이브 환자: p.id === encounter_id)
//   · "subject:{subject_id}" (데모 환자: p.id="P-{subject_id}"라 직접 매칭 불가)
function soGyeonOf(
  p: DemoPatient,
  backend: Map<string, BackendReportStatus>,
): SoGyeon {
  const subjectKey = p.mimic?.subject_id ? `subject:${p.mimic.subject_id}` : null;
  const b = backend.get(p.id) ?? (subjectKey ? backend.get(subjectKey) : undefined);
  if (b === "signed" || b === "amended") return "signed";
  if (b === "reviewed") return "review";
  if (b === "preliminary") return "done";
  if (p.aiStatus === "done") {
    const l = getLocalReportStatus(p.id);
    if (l === "signed" || l === "amended") return "signed";
    if (l === "reviewed") return "review";
    if (p.awaitingSign) return "review";
    return "done";
  }
  return "all";
}
// 검사 진행 상태 — 검사 대기 / 검사 중 / 검사 완료
function examStatusOf(p: DemoPatient): ExamStatus {
  if (p.aiStatus === "done") return "done";
  if (p.aiStatus === "analyzing") return "inProgress";
  return "waiting";
}
// 행 클릭 라우팅 — 검사 진행 상태 + 소견서 서명 여부로 분기
//   · 서명 완료 → 소견서 뷰어 (읽기 전용 A4)
//   · 검사 완료 → AI 종합소견 생성 (편집기)
//   · 검사 대기·진행 → AI 분석 (PatientDetail)
function rowHref(p: DemoPatient, sg: SoGyeon): string {
  const live = isLivePatient(p.id);
  const q = live ? `?encounter_id=${p.id}` : "";
  if (sg === "signed") return `/demo/patient/${p.id}/report/view${q}`;
  if (examStatusOf(p) === "done") return `/demo/patient/${p.id}/report${q}`;
  return `/demo/patient/${p.id}${q}`;
}

export default function WorklistPage() {
  const nav = useNavigate();
  const all = getAllPatients();

  const [searchBy, setSearchBy] = useState<"reg" | "name">("name");
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [soGyeon, setSoGyeon] = useState<SoGyeon>("all");
  const [ktasFilter, setKtasFilter] = useState<KtasFilter>("all");
  const [page, setPage] = useState(1);

  // 백엔드 소견서 상태 — encounter_id → status
  // 모바일에서 서명/검토 변경 시 웹도 자동 반영되도록 10초 폴링 + 탭 포커스 시 즉시 refresh.
  const [backendStatus, setBackendStatus] = useState<Map<string, BackendReportStatus>>(new Map());
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const reports = await listReports();
        if (stopped) return;
        // 양방향 키: encounter_id + "subject:{subject_id}"로 등록해
        // 라이브 환자/데모 환자 모두 lookup 성공.
        const m = new Map<string, BackendReportStatus>();
        for (const r of reports) {
          m.set(r.encounter_id, r.status);
          if (r.subject_id) m.set(`subject:${r.subject_id}`, r.status);
        }
        setBackendStatus(m);
      } catch {
        /* swallow — backend down 등 일시 오류 */
      }
    };
    refresh();
    const intervalId = window.setInterval(refresh, 3_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("say6:reports:invalidate", refresh);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("say6:reports:invalidate", refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    let list = [...all];
    if (soGyeon !== "all") list = list.filter((p) => soGyeonOf(p, backendStatus) === soGyeon);
    if (ktasFilter !== "all") list = list.filter((p) => p.ktas === ktasFilter);
    const q = qApplied.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        searchBy === "reg"
          ? regNo(p).toLowerCase().includes(q)
          : p.name.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => a.ktas - b.ktas);
    return list;
  }, [all, soGyeon, ktasFilter, qApplied, searchBy, backendStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 검사 진행 현황 — 상태별 그룹
  const examGroups = useMemo(() => {
    const g: Record<ExamStatus, DemoPatient[]> = { waiting: [], inProgress: [], done: [] };
    for (const p of [...all].sort((a, b) => a.ktas - b.ktas)) g[examStatusOf(p)].push(p);
    return g;
  }, [all]);

  function runSearch() {
    setQApplied(qDraft);
    setPage(1);
  }

  return (
    <AppShell notifications={3}>
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-[1700px] mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-[260px_1fr_290px] gap-5 items-stretch min-h-[calc(100vh-3.5rem)]">
        {/* ── 좌: 환자 조회 ── */}
        <aside className="bg-white border border-slate-200 dark:bg-vuno-surface dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
          <PanelHead title="환자 조회" />
          <div className="p-4 flex-1 space-y-4 text-[13px]">
            <div>
              <FilterLabel>검색 기준</FilterLabel>
              <div className="flex gap-3 mb-2">
                <Radio label="등록번호" active={searchBy === "reg"} onClick={() => setSearchBy("reg")} />
                <Radio label="이름" active={searchBy === "name"} onClick={() => setSearchBy("name")} />
              </div>
              <input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder={searchBy === "reg" ? "등록번호 입력" : "환자명 입력"}
                className="w-full h-9 px-2.5 text-[13px] rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 dark:bg-vuno-bg dark:border-vuno-border dark:text-white dark:placeholder:text-vuno-dim focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors"
              />
            </div>

            <div>
              <FilterLabel>소견 상태</FilterLabel>
              <div className="flex flex-col items-start gap-2.5">
                <Radio label="전체" active={soGyeon === "all"} onClick={() => setSoGyeon("all")} />
                <Radio label="작성 가능 (AI 분석 완료)" active={soGyeon === "done"} onClick={() => setSoGyeon("done")} />
                <Radio label="검토 중 / 서명 대기" active={soGyeon === "review"} onClick={() => setSoGyeon("review")} />
                <Radio label="서명 완료 · EMR 전송" active={soGyeon === "signed"} onClick={() => setSoGyeon("signed")} />
              </div>
            </div>

            <div>
              <FilterLabel>KTAS 등급</FilterLabel>
              <div className="grid grid-cols-3 gap-1.5">
                <KtasChip label="전체" active={ktasFilter === "all"} onClick={() => setKtasFilter("all")} />
                {([1, 2, 3, 4, 5] as KTAS[]).map((k) => (
                  <KtasChip key={k} label={`KTAS ${k}`} active={ktasFilter === k} onClick={() => setKtasFilter(k)} bg={KTAS_META[k].bg} />
                ))}
              </div>
            </div>
          </div>
          <div className="p-3 border-t border-slate-200">
            <button
              onClick={runSearch}
              className="w-full h-10 rounded-lg bg-brand-600 text-white text-[13px] font-bold hover:bg-brand-700 shadow-sm shadow-brand-600/20 inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Search className="h-4 w-4" /> 검색
            </button>
          </div>
        </aside>

        {/* ── 중: 환자 목록 ── */}
        <section className="bg-white border border-slate-200 dark:bg-vuno-surface dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 dark:border-vuno-border dark:bg-vuno-bg flex items-center gap-2">
            <span className="text-base font-bold text-slate-900 dark:text-white">환자 목록</span>
            <span className="text-xs text-slate-400 dark:text-vuno-dim">Total {filtered.length}명</span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted text-[13px]">
                <tr className="border-b border-slate-200 dark:border-vuno-border whitespace-nowrap">
                  <th className="px-3 py-3 w-12 text-left">No.</th>
                  <th className="px-3 py-3 text-left w-28">등록번호</th>
                  <th className="px-3 py-3 text-left w-24">환자명</th>
                  <th className="px-3 py-3 text-left w-20">나이/성별</th>
                  <th className="px-3 py-3 text-left w-24">KTAS</th>
                  <th className="px-3 py-3 text-left">주증상</th>
                  <th className="px-3 py-3 text-left w-36">등록시각</th>
                  <th className="px-3 py-3 text-center w-36">검사 상태</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p, i) => {
                  const meta = KTAS_META[p.ktas as KTAS];
                  const sg = soGyeonOf(p, backendStatus);
                  const es = examStatusOf(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 hover:bg-brand-50/40 dark:border-vuno-divider dark:hover:bg-brand-500/10 cursor-pointer"
                      onClick={() => nav(rowHref(p, sg))}
                    >
                      <td className="px-3 py-3 text-slate-400 dark:text-vuno-dim font-numeric whitespace-nowrap">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3 font-numeric text-brand-700 dark:text-brand-300 underline whitespace-nowrap">{regNo(p)}</td>
                      <td className="px-3 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">{p.name}</td>
                      <td className="px-3 py-3 text-slate-500 dark:text-vuno-muted text-[13px] whitespace-nowrap">{p.age}세 / {p.sex === "M" ? "남" : "여"}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={cn("inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white", meta.bg)}>
                          KTAS {p.ktas}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-vuno-muted text-[13px] max-w-[280px] truncate">{p.chief}</td>
                      <td className="px-3 py-3 text-slate-500 dark:text-vuno-muted text-[13px] font-numeric whitespace-nowrap">{fmtTime(p.registeredAt)}</td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <ExamStatusBadge exam={es} soGyeon={sg} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pageRows.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-vuno-dim">조건에 맞는 환자가 없습니다.</div>
            )}
          </div>

          {/* 페이지네이션 */}
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-vuno-border flex items-center gap-1.5">
            <span className="text-xs text-slate-400 dark:text-vuno-dim mr-auto">
              {filtered.length}명 중 {pageRows.length}명 표시
            </span>
            <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </PageBtn>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 6).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={cn(
                  "h-7 w-7 rounded-lg text-xs font-bold transition-colors",
                  page === n ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-vuno-bg dark:text-vuno-muted dark:border-vuno-border dark:hover:bg-vuno-elevated",
                )}
              >
                {n}
              </button>
            ))}
            <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </PageBtn>
          </div>
        </section>

        {/* ── 우: 검사 진행 현황 ── */}
        <aside className="bg-white border border-slate-200 dark:bg-vuno-surface dark:border-vuno-border rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
          <PanelHead title="검사 진행 현황" icon={Activity} />
          <div className="flex-1 overflow-auto p-3 space-y-2.5">
            <ExamGroup status="waiting" patients={examGroups.waiting} onOpen={(p) => nav(rowHref(p, soGyeonOf(p, backendStatus)))} />
            <ExamGroup status="inProgress" patients={examGroups.inProgress} onOpen={(p) => nav(rowHref(p, soGyeonOf(p, backendStatus)))} />
            <ExamGroup status="done" patients={examGroups.done} onOpen={(p) => nav(rowHref(p, soGyeonOf(p, backendStatus)))} />
          </div>
        </aside>
      </div>
      </div>
    </AppShell>
  );
}

/* ── 검사 진행 현황 — 상태 그룹 ── */
const EXAM_META: Record<ExamStatus, { ko: string; icon: typeof Clock; head: string; ring: string; dot: string }> = {
  waiting:    { ko: "검사 대기", icon: Clock,        head: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",       ring: "border-brand-300 dark:border-brand-500/40",     dot: "bg-brand-500" },
  inProgress: { ko: "검사 중",   icon: Loader2,      head: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",       ring: "border-amber-300 dark:border-amber-500/40",     dot: "bg-amber-500" },
  done:       { ko: "검사 완료", icon: CheckCircle2, head: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", ring: "border-emerald-300 dark:border-emerald-500/40", dot: "bg-emerald-500" },
};

function ExamGroup({
  status, patients, onOpen, defaultOpen,
}: {
  status: ExamStatus;
  patients: DemoPatient[];
  onOpen: (p: DemoPatient) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const m = EXAM_META[status];
  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-shadow",
      m.ring,
      open && "shadow-sm",
    )}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("w-full px-3.5 py-3 flex items-center gap-2 transition-colors", m.head)}
      >
        <m.icon className={cn("h-4 w-4", status === "inProgress" && "animate-spin")} />
        <span className="text-sm font-bold">{m.ko}</span>
        <span className="text-[13px] font-numeric font-bold">{patients.length}</span>
        <ChevronRight className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="bg-white border-t border-slate-100 dark:bg-vuno-surface dark:border-vuno-border">
          {patients.length === 0 ? (
            <div className="px-3.5 py-3 text-[12px] text-slate-400 dark:text-vuno-dim text-center">해당 환자 없음</div>
          ) : (
            patients.map((p) => {
              const meta = KTAS_META[p.ktas as KTAS];
              return (
                <button
                  key={p.id}
                  onClick={() => onOpen(p)}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-brand-50/40 dark:border-vuno-divider dark:hover:bg-brand-500/10 text-left transition-colors"
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white flex-shrink-0", meta.bg)}>
                    KTAS {p.ktas}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-vuno-muted truncate">{p.chief}</div>
                  </div>
                  <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", m.dot)} />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ── 헬퍼 컴포넌트 ── */
function PanelHead({ title, icon: Icon }: { title: string; icon?: typeof Activity }) {
  return (
    <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 dark:border-vuno-border dark:bg-vuno-bg flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-slate-600 dark:text-vuno-muted" />}
      <span className="text-base font-bold text-slate-900 dark:text-white">{title}</span>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-slate-500 dark:text-vuno-muted mb-1.5">{children}</div>;
}

function Radio({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13px]">
      <span className={cn(
        "h-3.5 w-3.5 rounded-full border-2 grid place-items-center",
        active ? "border-brand-600 dark:border-brand-400" : "border-slate-300 dark:border-vuno-border",
      )}>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" />}
      </span>
      <span className={active ? "text-slate-900 dark:text-white font-semibold" : "text-slate-600 dark:text-vuno-muted"}>{label}</span>
    </button>
  );
}

function KtasChip({ label, active, onClick, bg }: { label: string; active: boolean; onClick: () => void; bg?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg text-[11px] font-bold border transition-colors",
        active
          ? bg ? cn(bg, "text-white border-transparent") : "bg-brand-600 text-white border-brand-600"
          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-white hover:border-slate-300 dark:bg-vuno-bg dark:text-vuno-muted dark:border-vuno-border dark:hover:bg-vuno-elevated",
      )}
    >
      {label}
    </button>
  );
}

function PageBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-lg grid place-items-center border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-vuno-border dark:text-vuno-muted dark:hover:bg-vuno-elevated disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// 검사 진행(검사 완료 / 검사 대기) + 소견서 서명 상태를 한 번에 보여주는 배지
//   · 서명 완료 → emerald "✓ 서명 완료" (소견서 뷰어로 이동)
//   · 검사 완료 → emerald "✓ 검사 완료" (AI 종합소견 생성 페이지로 이동)
//   · 검사 진행 중 → amber blink "분석 중"
//   · 검사 대기 → slate "검사 대기" (AI 분석 페이지로 이동)
function ExamStatusBadge({ exam, soGyeon }: { exam: ExamStatus; soGyeon: SoGyeon }) {
  if (soGyeon === "signed") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 border border-emerald-400 text-emerald-700">✓ 서명 완료</span>;
  }
  if (exam === "done") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 border border-emerald-300 text-emerald-700">✓ 검사 완료</span>;
  }
  if (exam === "inProgress") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 border border-amber-400 text-amber-700 animate-pulse">분석 중</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 border border-slate-300 text-slate-600">검사 대기</span>;
}
