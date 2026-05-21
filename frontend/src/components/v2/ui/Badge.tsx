import type { HTMLAttributes } from "react";
import { cn } from "../../../lib/cn";

type Tone = "critical" | "urgent" | "warning" | "normal" | "info" | "ai" | "neutral";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: "sm" | "md";
  dot?: boolean;
}

const toneStyles: Record<Tone, string> = {
  critical: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/40",
  urgent:   "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/40",
  warning:  "bg-yellow-50 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/40",
  normal:   "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40",
  info:     "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/40",
  ai:       "bg-ai-bg text-brand-700 ring-brand-600/20 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/40",
  neutral:  "bg-slate-100 text-slate-700 ring-slate-600/10 dark:bg-vuno-elevated dark:text-slate-200 dark:ring-white/10",
};

const dotStyles: Record<Tone, string> = {
  critical: "bg-critical",
  urgent:   "bg-urgent",
  warning:  "bg-warning",
  normal:   "bg-normal",
  info:     "bg-blue-500",
  ai:       "bg-brand-500",
  neutral:  "bg-slate-400",
};

export function Badge({ tone = "neutral", size = "sm", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[tone])} />}
      {children}
    </span>
  );
}
