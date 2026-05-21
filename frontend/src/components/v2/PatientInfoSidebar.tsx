// say-6 v2 — 환자 정보 좌측 사이드바 (환자 상세 / 소견서 페이지 공용)
// 환자 헤더 · 기본정보 · 주증상 · 활력징후 · 과거력/알레르기

import { useEffect, useState } from "react";
import { KTAS_META, type KTAS, PAST_HISTORY_LABELS } from "../../types/triage";
import type { DemoPatient } from "../../lib/v2/demoStore";
import { cn } from "../../lib/cn";

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PatientInfoSidebar({ patient }: { patient: DemoPatient }) {
  const meta = KTAS_META[patient.ktas as KTAS];
  const v = patient.vitals;
  // 메모 — 환자별 로컬 편집 (데모 세션 한정)
  const [memo, setMemo] = useState(patient.notes ?? "");
  useEffect(() => { setMemo(patient.notes ?? ""); }, [patient.id, patient.notes]);
  const vitalRows: [string, number | null, string, boolean][] = [
    ["HR", v.hr, "bpm", !!v.hr && (v.hr < 50 || v.hr > 120)],
    ["SBP", v.sbp, "mmHg", !!v.sbp && (v.sbp < 90 || v.sbp > 160)],
    ["DBP", v.dbp, "mmHg", false],
    ["RR", v.rr, "/min", !!v.rr && (v.rr < 10 || v.rr > 24)],
    ["SpO₂", v.spo2, "%", !!v.spo2 && v.spo2 < 95],
    ["BT", v.bt, "℃", !!v.bt && (v.bt < 36 || v.bt > 38)],
  ];

  return (
    <aside className="h-full">
      <div className="bg-white dark:bg-vuno-surface border border-slate-300 dark:border-vuno-border shadow-sm h-full flex flex-col">
        {/* 환자 헤더 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn("inline-block px-2 py-0.5 text-[11px] font-bold text-white", meta.bg)}>
              KTAS {patient.ktas} · {meta.label}
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{patient.name}</div>
          <div className="text-[13px] text-slate-500 dark:text-vuno-muted font-numeric mt-0.5">
            {patient.sex === "M" ? "남" : "여"} / {patient.age}세
          </div>
        </div>

        {/* 기본정보 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>기본정보</SidebarLabel>
          <InfoRow label="등록번호" value={<span className="font-numeric break-all">{patient.mimic?.subject_id ?? patient.mrn ?? patient.id}</span>} />
          {patient.mimic?.subject_id && (
            <InfoRow label="데이터원" value={<span className="text-vuno-cyanDim font-bold">MIMIC-IV</span>} />
          )}
          <InfoRow label="도착시각" value={<span className="whitespace-nowrap">{fmtTime(patient.arrivedAt)}</span>} />
          <InfoRow label="등록시각" value={<span className="whitespace-nowrap">{fmtTime(patient.registeredAt)}</span>} />
        </div>

        {/* 주증상 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>주증상 (Chief Complaint)</SidebarLabel>
          <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed">{patient.chief}</p>
        </div>

        {/* 활력징후 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>활력징후 (Vital Signs)</SidebarLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {vitalRows.map(([label, val, unit, abn]) => (
              <div key={label} className={cn(
                "border px-2 py-1.5",
                abn ? "border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/15" : "border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg",
              )}>
                <div className="text-[10px] text-slate-500 dark:text-vuno-muted whitespace-nowrap">{label}</div>
                <div className={cn("font-numeric font-bold text-[14px] whitespace-nowrap", abn ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white")}>
                  {val ?? "—"}<span className="text-[9px] font-normal text-slate-400 dark:text-vuno-dim ml-0.5">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 과거력 / 알레르기 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>과거력 / 알레르기</SidebarLabel>
          {patient.pastHistory && patient.pastHistory.length > 0 ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {patient.pastHistory.map((h) => (
                <span key={h} className="px-1.5 py-0.5 text-[11px] font-bold bg-slate-100 dark:bg-vuno-bg dark:text-slate-200 border border-slate-300 dark:border-vuno-border" title={PAST_HISTORY_LABELS[h]}>
                  {h}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400 dark:text-vuno-dim mb-2">과거력 없음</p>
          )}
          <div className="text-[12px] text-slate-600 dark:text-vuno-muted">
            <span className="text-slate-400 dark:text-vuno-dim">알레르기 </span>{patient.allergies || "NKDA"}
          </div>
          {patient.medications && (
            <div className="text-[12px] text-slate-600 dark:text-vuno-muted mt-0.5 leading-relaxed">
              <span className="text-slate-400 dark:text-vuno-dim">복용약 </span>{patient.medications}
            </div>
          )}
        </div>

        {/* 메모 — 남은 공간 채움 */}
        <div className="px-4 py-3.5 flex-1 flex flex-col">
          <SidebarLabel>메모 (Notes)</SidebarLabel>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="환자 특이사항 · 인계 메모를 입력하세요"
            className="flex-1 min-h-[100px] w-full px-2.5 py-2 text-[12px] leading-relaxed border border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg dark:text-white dark:placeholder:text-vuno-dim focus:outline-none focus:border-vuno-cyan focus:bg-white dark:focus:bg-vuno-bg resize-none"
          />
        </div>
      </div>
    </aside>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-slate-500 dark:text-vuno-muted tracking-wide mb-1.5 whitespace-nowrap">{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[13px] py-0.5">
      <span className="text-slate-500 dark:text-vuno-muted flex-shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-white font-medium text-right">{value}</span>
    </div>
  );
}
