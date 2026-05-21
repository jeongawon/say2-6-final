import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export type RiskLevel = "critical" | "urgent" | "warning" | "normal" | "analyzing";

const STYLES: Record<RiskLevel, { bg: string; ring: string; icon: typeof AlertCircle; label: string }> = {
  critical:  { bg: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",            ring: "ring-red-600/30 dark:ring-red-500/40",         icon: AlertCircle,    label: "Critical" },
  urgent:    { bg: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", ring: "ring-orange-600/30 dark:ring-orange-500/40",   icon: AlertTriangle,  label: "Urgent" },
  warning:   { bg: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300", ring: "ring-yellow-600/30 dark:ring-yellow-500/40",   icon: AlertTriangle,  label: "Warning" },
  normal:    { bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", ring: "ring-emerald-600/30 dark:ring-emerald-500/40", icon: CheckCircle2,  label: "Normal" },
  analyzing: { bg: "bg-slate-100 text-slate-600 dark:bg-vuno-bg dark:text-vuno-muted",        ring: "ring-slate-400/30 dark:ring-vuno-border",      icon: Loader2,        label: "분석중" },
};

interface RiskBadgeProps {
  level: RiskLevel;
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RiskBadge({ level, text, size = "md", className }: RiskBadgeProps) {
  const style = STYLES[level];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-semibold",
        style.bg,
        style.ring,
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3 py-1.5 text-sm",
        className,
      )}
    >
      <Icon
        className={cn(
          size === "sm" ? "h-3 w-3" : size === "md" ? "h-3.5 w-3.5" : "h-4 w-4",
          level === "analyzing" && "animate-spin",
        )}
      />
      {text ?? style.label}
    </span>
  );
}
