import { ArrowLeft, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { KtasBadge } from "./KtasBadge";
import { Button } from "./ui/Button";
import { cn } from "../../lib/cn";
import type { KTAS, Sex, Vitals } from "../../types/triage";

interface PatientContextBarProps {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  ktas: KTAS;
  chief: string;
  arrivedAt: string;
  vitals?: Partial<Vitals>;
  onReport?: () => void;
}

function VitalChip({ label, value, unit, abnormal }: { label: string; value: string | number | null | undefined; unit?: string; abnormal?: boolean }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/60 dark:bg-vuno-surface/60 text-xs">
      <span className="text-slate-500 dark:text-vuno-muted">{label}</span>
      <span className={cn("font-numeric font-semibold", abnormal ? "text-critical" : "text-slate-900 dark:text-white")}>
        {value}
      </span>
      {unit && <span className="text-slate-400 dark:text-vuno-dim">{unit}</span>}
      {abnormal && <span className="text-critical text-[10px]">↓</span>}
    </span>
  );
}

export function PatientContextBar({ id, name, age, sex, ktas, chief, arrivedAt, vitals, onReport }: PatientContextBarProps) {
  const elapsed = Math.round((Date.now() - new Date(arrivedAt).getTime()) / 60000);
  const isCritical = ktas === 1 || ktas === 2;

  return (
    <div
      className={cn(
        "sticky top-0 z-20 border-b backdrop-blur-md",
        isCritical
          ? "bg-red-50/95 dark:bg-red-500/15 border-red-200 dark:border-red-500/40"
          : "bg-white/95 dark:bg-vuno-surface/95 border-slate-200 dark:border-vuno-border",
      )}
    >
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
        <Link
          to="/demo/worklist"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-vuno-muted hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Worklist
        </Link>

        <div className="h-6 w-px bg-slate-300 dark:bg-vuno-border" />

        <KtasBadge level={ktas} size="md" />

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-numeric text-sm text-slate-500 dark:text-vuno-muted">#{id}</span>
          <span className="font-semibold text-slate-900 dark:text-white truncate">{name}</span>
          <span className="text-sm text-slate-500 dark:text-vuno-muted">{sex}/{age}</span>
        </div>

        <div className="h-6 w-px bg-slate-300 dark:bg-vuno-border" />

        <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 min-w-0">
          <span className="text-slate-500 dark:text-vuno-muted">주증상:</span>
          <span className="truncate">{chief}</span>
        </div>

        <div className="h-6 w-px bg-slate-300 dark:bg-vuno-border" />

        {vitals && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <VitalChip label="HR" value={vitals.hr} unit="bpm" abnormal={!!vitals.hr && (vitals.hr < 50 || vitals.hr > 120)} />
            {vitals.sbp != null && vitals.dbp != null && (
              <VitalChip label="BP" value={`${vitals.sbp}/${vitals.dbp}`} abnormal={vitals.sbp > 160 || vitals.sbp < 90} />
            )}
            <VitalChip label="SpO₂" value={vitals.spo2} unit="%" abnormal={!!vitals.spo2 && vitals.spo2 < 95} />
            <VitalChip label="T°" value={vitals.bt} unit="℃" abnormal={!!vitals.bt && (vitals.bt < 36 || vitals.bt > 38)} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-vuno-muted font-numeric">{elapsed}분 경과</span>
          <Button size="sm" variant="primary" onClick={onReport}>
            <FileText className="h-4 w-4" />
            소견서
          </Button>
        </div>
      </div>
    </div>
  );
}
