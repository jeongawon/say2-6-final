import { cn } from "../../lib/cn";

/* AI 신뢰도 배지 — AI 권고/판독에 모델 확신도를 노출.
 * 연동 전에는 데모 값을, 연동 후엔 ServiceRequest/모달 출력의 confidence를 그대로 넣으면 됨.
 *   ≥90 emerald(높음) · ≥80 brand(보통) · 그 외 amber(낮음 — 의사 확인 권장) */
export function ConfidenceBadge({ value, className, size = "sm", uniform = false }: { value: number; className?: string; size?: "sm" | "lg"; uniform?: boolean }) {
  // uniform=true: 값과 무관하게 항상 같은 색(1·2·3차 권고 신뢰도 배지 색을 통일).
  const tone = uniform
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
    : value >= 90
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40"
      : value >= 80
      ? "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:border-brand-500/40"
      : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40";
  return (
    <span
      title="AI 판단 신뢰도"
      className={cn(
        "inline-flex items-center gap-1 rounded border font-bold whitespace-nowrap",
        size === "lg" ? "px-3 py-1.5 text-[14px]" : "px-1.5 py-0.5 text-[10px]",
        tone,
        className,
      )}
    >
      <span className={cn("font-semibold opacity-70", size === "lg" ? "text-[11px]" : "text-[8px]")}>신뢰도</span>
      {value}%
    </span>
  );
}
