import { cn } from "../../lib/cn";
import type { WsStatus } from "../../lib/v2/useEncounterData";

/* WebSocket 실시간 연결 상태 뱃지 — AI 분석 / AI 결과 공용 */
export function LiveBadge({ status, className }: { status: WsStatus; className?: string }) {
  const isLive = status === "open";
  const label = isLive ? "LIVE" : status === null ? "연결 중…" : "재연결 중…";
  const dot = isLive ? "bg-emerald-500" : "bg-slate-300 dark:bg-vuno-dim";
  const ring = isLive ? "ring-emerald-400/40" : "ring-slate-300/40 dark:ring-vuno-border";
  const text = isLive ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-vuno-muted";
  const bg = isLive
    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/40"
    : "bg-slate-50 border-slate-200 dark:bg-vuno-bg dark:border-vuno-border";
  return (
    <span
      title={isLive ? "백엔드와 실시간 연결됨 (WebSocket)" : "재연결 시도 중 — 10초 폴링으로 fallback"}
      className={cn(
        "inline-flex items-center gap-1.5 h-5 px-2 border rounded-full text-[10px] font-bold tracking-wider",
        bg, text, className,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full ring-2", dot, ring, isLive && "animate-pulse")} />
      {label}
    </span>
  );
}
