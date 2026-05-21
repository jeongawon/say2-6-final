import { cn } from "../../../lib/cn";

interface TabItem {
  key: string;
  label: string;
  badge?: string | number;
  tone?: "default" | "critical" | "ai" | "done" | "analyzing";
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-slate-200 dark:border-vuno-border", className)} role="tablist">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative px-4 py-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
              active
                ? "text-brand-700 dark:text-brand-300"
                : "text-slate-600 hover:text-slate-900 dark:text-vuno-muted dark:hover:text-white",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-5 px-2 rounded-full text-[11px] font-bold border",
                    item.tone === "critical" && "bg-red-100 border-red-300 text-red-700 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-300",
                    item.tone === "ai"       && "bg-ai-bg border-brand-300 text-brand-700 dark:bg-brand-500/15 dark:border-brand-500/40 dark:text-brand-300",
                    item.tone === "done"     && "bg-emerald-100 border-emerald-400 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300",
                    item.tone === "analyzing" && "bg-amber-100 border-amber-400 text-amber-700 animate-pulse dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300",
                    (!item.tone || item.tone === "default") && "bg-slate-100 border-slate-200 text-slate-700 dark:bg-vuno-elevated dark:border-vuno-border dark:text-slate-200",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </span>
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
