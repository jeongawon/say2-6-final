import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, ChevronRight } from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { getAllPatients, isLivePatient, getLocalReportStatus, getCurrentPatient, type DemoPatient } from "../../lib/v2/demoStore";
import { PatientInfoSidebar } from "../../components/v2/PatientInfoSidebar";
import { listReports, type ReportStatus as BackendReportStatus } from "../../lib/v2/api";
import { KTAS_META, type KTAS } from "../../types/triage";
import { cn } from "../../lib/cn";

/* ─────────────────────────────────────────────────────────
   say-6 종합소견서 — 환자별 AI 소견서 작성/검토 목록
   ───────────────────────────────────────────────────────── */

type ReportStatus = "analyzing" | "ready" | "review" | "signed";

const STATUS_META: Record<ReportStatus, { ko: string; cls: string }> = {
  analyzing: { ko: "AI 분석 중", cls: "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300" },
  ready:     { ko: "작성 가능",  cls: "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-300" },
  review:    { ko: "검토·서명 대기", cls: "bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-500/15 dark:border-purple-500/40 dark:text-purple-300" },
  signed:    { ko: "서명 완료",  cls: "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300" },
};

// 우선순위: 백엔드 diagnostic_reports.status → 로컬 캐시(데모 환자) → demoStore 추정.
// 단, "작성 가능(ready)"·"검토 중(review)"은 AI 분석이 완료(aiStatus === "done")돼야 표시.
// (ReportEditorPage 가 마운트만 해도 "preliminary"를 캐시하는 leak를 방어 — 캐시는 AI 완료 후에만 신뢰)
//
// backend Map은 양방향 키:
//   · encounter_id (라이브 환자 — p.id === encounter_id)
//   · "subject:{subject_id}" (데모 환자 — p.id="P-{subject_id}"로 직접 매칭 불가)
function reportStatusOf(
  p: DemoPatient,
  backend: Map<string, BackendReportStatus>,
): ReportStatus {
  // 백엔드에 실제 report 레코드가 있으면 그게 진실 — generate_report 가 호출됐다는 뜻
  const subjectKey = p.mimic?.subject_id ? `subject:${p.mimic.subject_id}` : null;
  const b = backend.get(p.id) ?? (subjectKey ? backend.get(subjectKey) : undefined);
  if (b === "signed" || b === "amended") return "signed";
  if (b === "reviewed") return "review";
  if (b === "preliminary") return "ready";

  // AI 분석이 끝났을 때만 로컬 캐시·휴리스틱을 신뢰
  if (p.aiStatus === "done") {
    const l = getLocalReportStatus(p.id);
    if (l === "signed" || l === "amended") return "signed";
    if (l === "reviewed") return "review";
    if (p.awaitingSign) return "review";
    return "ready";
  }

  // 분석 진행 중·대기는 소견서 상태도 동일하게 "분석 중"으로 처리
  return "analyzing";
}

type Filter = "all" | ReportStatus;
const FILTER_LABELS: Record<Filter, string> = {
  all: "전체",
  analyzing: "AI 분석 중",
  ready: "작성 가능",
  review: "검토·서명 대기",
  signed: "서명 완료",
};

export default function ReportListPage() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const patients = getAllPatients();

  // 백엔드 소견서 상태 — encounter_id / subject:{subject_id} 양방향 키.
  // 모바일에서 서명 시 웹도 자동 반영되도록 10초 폴링 + 탭 포커스 즉시 refresh.
  const [backendStatus, setBackendStatus] = useState<Map<string, BackendReportStatus>>(new Map());
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const reports = await listReports();
        if (stopped) return;
        const m = new Map<string, BackendReportStatus>();
        for (const r of reports) {
          m.set(r.encounter_id, r.status);
          if (r.subject_id) m.set(`subject:${r.subject_id}`, r.status);
        }
        setBackendStatus(m);
      } catch {
        /* swallow */
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: patients.length, analyzing: 0, ready: 0, review: 0, signed: 0 };
    for (const p of patients) c[reportStatusOf(p, backendStatus)] += 1;
    return c;
  }, [patients, backendStatus]);

  const rows = useMemo(() => {
    let list = patients.map((p) => ({ p, status: reportStatusOf(p, backendStatus) }));
    if (filter !== "all") list = list.filter((r) => r.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (r) => r.p.name.toLowerCase().includes(q) || r.p.id.includes(q) || r.p.chief.includes(query),
      );
    }
    list.sort((a, b) => a.p.ktas - b.p.ktas);
    return list;
  }, [patients, filter, query, backendStatus]);

  function openReport(p: DemoPatient, status: ReportStatus) {
    const live = isLivePatient(p.id);
    const q = live ? `?encounter_id=${p.id}` : "";
    // 분석 중 → AI 분석 페이지(/patient/:id), 서명 완료 → 뷰어, 그 외 → 편집기
    const path =
      status === "analyzing" ? `/demo/patient/${p.id}${q}` :
      status === "signed"    ? `/demo/patient/${p.id}/report/view${q}` :
                               `/demo/patient/${p.id}/report${q}`;
    nav(path);
  }

  return (
    <AppShell notifications={counts.review}>
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)] lg:grid lg:grid-cols-[390px_1fr] lg:items-stretch">
      {/* 좌: 현재 환자 정보 사이드바 (고정) */}
      <PatientInfoSidebar patient={getCurrentPatient()} allowEdit className="hidden lg:block lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto" />
      <div className="min-w-0">
      <div className="max-w-[1500px] mx-auto px-6 py-6">
        {/* 헤더 */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-brand-600" /> 종합소견서
          </h1>
          <p className="text-[15px] text-slate-500 dark:text-vuno-muted mt-1">환자별 AI 종합 소견서 작성 · 검토 · 서명</p>
        </div>

        {/* 필터 + 검색 */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-9 px-3.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5",
                  filter === f
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-slate-50 dark:bg-vuno-surface text-slate-700 dark:text-slate-200 border-slate-200 dark:border-vuno-border hover:bg-white dark:hover:bg-vuno-elevated hover:border-slate-300",
                )}
              >
                {FILTER_LABELS[f]}
                <span className={cn(
                  "text-[11px] font-numeric px-1",
                  filter === f ? "text-white/80" : "text-slate-400 dark:text-vuno-dim",
                )}>
                  {counts[f]}
                </span>
              </button>
            ))}
          </div>
          <div className="md:ml-auto relative md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-vuno-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="환자 검색 (이름, ID, 증상)…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 dark:border-vuno-border dark:bg-vuno-bg dark:text-white dark:placeholder:text-vuno-dim text-sm focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors"
            />
          </div>
        </div>

        {/* 목록 테이블 */}
        <div className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-vuno-bg text-slate-600 dark:text-vuno-muted text-[13px] border-b border-slate-200 dark:border-vuno-border">
                <th className="text-left px-4 py-3 font-semibold w-28">KTAS</th>
                <th className="text-left px-4 py-3 font-semibold">환자</th>
                <th className="text-left px-4 py-3 font-semibold">등록번호</th>
                <th className="text-left px-4 py-3 font-semibold">주증상</th>
                <th className="text-center px-4 py-3 font-semibold w-28">분석</th>
                <th className="text-center px-4 py-3 font-semibold w-40">소견서 상태</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, status }) => {
                const meta = KTAS_META[p.ktas as KTAS];
                const sm = STATUS_META[status];
                return (
                  <tr
                    key={p.id}
                    onClick={() => openReport(p, status)}
                    className="border-b border-slate-100 dark:border-vuno-divider hover:bg-slate-50 dark:hover:bg-vuno-elevated cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={cn("inline-block px-2 py-0.5 rounded text-[12px] font-bold text-white", meta.bg)}>
                        KTAS {p.ktas}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white text-[15px]">{p.name}</div>
                      <div className="text-[12px] text-slate-400 dark:text-vuno-dim">{p.sex === "M" ? "남" : "여"} / {p.age}세</div>
                    </td>
                    <td className="px-4 py-3 font-numeric text-slate-500 dark:text-vuno-muted text-[13px]">
                      {p.mimic?.subject_id ?? p.mrn ?? p.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-vuno-muted text-[13px] max-w-[280px] truncate">{p.chief}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "text-[13px] font-bold",
                        p.aiStatus === "done" ? "text-emerald-600 dark:text-emerald-400" :
                        p.aiStatus === "analyzing" ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-vuno-dim",
                      )}>
                        {p.aiStatus === "done" ? "완료" : p.aiStatus === "analyzing" ? "진행 중" : "대기"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-block px-2.5 py-1 rounded-md text-[12px] font-bold border", sm.cls)}>
                        {sm.ko}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-0.5 text-[13px] font-bold",
                        status === "analyzing" ? "text-slate-400 dark:text-vuno-dim" : "text-brand-600",
                      )}>
                        소견서 <ChevronRight className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="py-16 text-center text-slate-400 dark:text-vuno-dim text-sm">조건에 맞는 환자가 없습니다.</div>
          )}
        </div>
      </div>
      </div>
      </div>
    </AppShell>
  );
}
