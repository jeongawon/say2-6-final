import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, FileText, Siren, CheckCircle2 } from "lucide-react";
import { listReports, type ReportRow } from "../../lib/v2/api";
import { cn } from "../../lib/cn";

/* ─────────────────────────────────────────────────────────
   NotificationsDropdown
   - 헤더 종 버튼 + 클릭 시 3섹션 드롭다운 패널
   - 섹션:  미서명 소견서 / Critical 환자 / 검사 완료·작성 가능
   - 데이터: GET /reports/list (10초 폴링 + 탭 포커스 즉시 refresh)
   ───────────────────────────────────────────────────────── */

type Bucket = "unsigned" | "critical" | "ready";

function fmt(ts?: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 생성 후 경과 분(올림). 0이면 null. */
function elapsedMin(ts?: string | null): number | null {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return null;
  return Math.max(0, Math.floor(ms / 60_000));
}

/** 5분 이상 미서명이면 빨강 강조 */
const OVERDUE_MIN = 5;

function bucketize(rows: ReportRow[]): Record<Bucket, ReportRow[]> {
  const unsigned: ReportRow[] = [];
  const critical: ReportRow[] = [];
  const ready: ReportRow[] = [];
  for (const r of rows) {
    if (r.status === "signed" || r.status === "amended") continue; // 완료된 건은 어떤 섹션도 X
    const e = elapsedMin(r.created_at);
    const overdue = e !== null && e >= OVERDUE_MIN;

    // 검사 완료·작성 가능: 소견서 생성 직후 0~5분 동안만 노출 (preliminary만)
    if (r.status === "preliminary" && !overdue) ready.push(r);

    // 미서명 소견서: 5분 경과해도 서명 안 한 건 (preliminary or reviewed)
    if ((r.status === "preliminary" || r.status === "reviewed") && overdue) {
      unsigned.push(r);
    }

    // Critical 환자: 미서명 상태에서 위험도 critical
    if (r.ai_risk_level === "critical") critical.push(r);
  }
  return { unsigned, critical, ready };
}

export function NotificationsDropdown() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listReports();
      setRows(data);
    } catch {
      /* swallow */
    }
  }, []);

  useEffect(() => {
    refresh();
    // 3초 polling — 의사가 generate → 빠르게 sign 가는 window를 안 놓치도록 짧게.
    const id = window.setInterval(refresh, 3_000);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // ReportEditorPage 등에서 generate 성공 직후 dispatch — 즉시 패널 refresh.
    const onInvalidate = () => refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    window.addEventListener("say6:reports:invalidate", onInvalidate);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("say6:reports:invalidate", onInvalidate);
    };
  }, [refresh]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const buckets = bucketize(rows);
  const total = buckets.unsigned.length + buckets.critical.length + buckets.ready.length;

  function goPatient(r: ReportRow) {
    // 데모 환자(p.id="P-{subject}") 또는 라이브(encounter_id) 둘 다 사용 가능한 경로.
    // 라이브 케이스: ?encounter_id={enc} 쿼리로 deep link.
    const patientId = r.subject_id ? `P-${r.subject_id}` : r.encounter_id;
    const path =
      r.status === "signed"
        ? `/demo/patient/${patientId}/report/view?encounter_id=${r.encounter_id}`
        : `/demo/patient/${patientId}/report?encounter_id=${r.encounter_id}`;
    nav(path);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={total > 0 ? `알림 ${total}건` : "알림 없음"}
        className="relative h-11 w-11 rounded-lg hover:bg-white/10 grid place-items-center transition-colors"
      >
        <Bell className="h-6 w-6 text-white" strokeWidth={2.25} />
        {total > 0 && (
          <span className="absolute top-0.5 right-0.5 h-[18px] min-w-[18px] px-1 rounded-full bg-white text-brand-700 text-[11px] font-bold grid place-items-center ring-2 ring-brand-600">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white border border-slate-300 dark:bg-vuno-surface dark:border-vuno-border rounded-xl shadow-xl z-50 max-h-[70vh] overflow-auto">
          <div className="sticky top-0 bg-slate-50 border-b border-slate-200 dark:bg-vuno-bg dark:border-vuno-border px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-white">알림</span>
            <span className="text-[12px] text-slate-500 dark:text-vuno-muted font-numeric">{total}건</span>
          </div>

          <Section
            icon={<FileText className="h-4 w-4" />}
            color="purple"
            title="미서명 소견서"
            rows={buckets.unsigned}
            showElapsed
            onClick={goPatient}
          />
          <Section
            icon={<Siren className="h-4 w-4" />}
            color="red"
            title="Critical 환자"
            rows={buckets.critical}
            onClick={goPatient}
          />
          <Section
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="emerald"
            title="검사 완료 · 작성 가능"
            rows={buckets.ready}
            showElapsed
            onClick={goPatient}
          />

          {total === 0 && (
            <div className="py-10 text-center text-slate-400 dark:text-vuno-dim text-sm">
              알림이 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  color,
  title,
  rows,
  onClick,
  showElapsed = false,
}: {
  icon: React.ReactNode;
  color: "purple" | "red" | "emerald";
  title: string;
  rows: ReportRow[];
  onClick: (r: ReportRow) => void;
  /** 미서명 섹션 — 경과 시간 + 5분 초과 빨강 강조. */
  showElapsed?: boolean;
}) {
  if (rows.length === 0) return null;
  const headBg = {
    purple: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  }[color];
  return (
    <div>
      <div className={cn("px-4 py-2 flex items-center gap-1.5 border-b border-slate-200 dark:border-vuno-border", headBg)}>
        {icon}
        <span className="text-[13px] font-bold">{title}</span>
        <span className="ml-auto text-[12px] font-numeric font-bold">{rows.length}</span>
      </div>
      {rows.map((r) => {
        const elapsed = showElapsed ? elapsedMin(r.created_at) : null;
        const overdue = elapsed !== null && elapsed >= OVERDUE_MIN;
        return (
          <button
            key={`${color}-${r.id}`}
            onClick={() => onClick(r)}
            className={cn(
              "w-full text-left px-4 py-2.5 border-b flex items-start gap-3 transition-colors",
              overdue
                ? "border-red-200 bg-red-50/40 hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15"
                : "border-slate-100 hover:bg-slate-50 dark:border-vuno-divider dark:hover:bg-vuno-elevated",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn(
                  "text-[13px] font-bold truncate",
                  overdue ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-white",
                )}>
                  {r.patient_name ?? r.subject_id ?? "환자"}
                </span>
                {r.subject_id && (
                  <span className="text-[11px] text-slate-400 dark:text-vuno-dim font-numeric">
                    #{r.subject_id}
                  </span>
                )}
                {elapsed !== null && (
                  <span className={cn(
                    "ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded",
                    overdue
                      ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40"
                      : "bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted",
                  )}>
                    {elapsed === 0 ? "방금" : `${elapsed}분 경과`}
                  </span>
                )}
              </div>
              {r.chief_complaint && (
                <div className={cn(
                  "text-[12px] truncate mt-0.5",
                  overdue ? "text-red-600 dark:text-red-300" : "text-slate-500 dark:text-vuno-muted",
                )}>{r.chief_complaint}</div>
              )}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-vuno-dim font-numeric whitespace-nowrap">
              {fmt(r.created_at)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
