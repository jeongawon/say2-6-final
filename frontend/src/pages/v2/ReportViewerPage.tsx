import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Printer, X, ArrowLeft } from "lucide-react";
import { ReportPrintSheet } from "../../components/v2/ReportPrintSheet";
import {
  findPatient,
  getLocalReportEdits, getLocalReportStatus, getLocalReportSignature,
} from "../../lib/v2/demoStore";
import { getReportByEncounter, type ReportStatus } from "../../lib/v2/api";

/* ─────────────────────────────────────────────────────────
   say-6 소견서 뷰어 — 서명 완료된 소견서 A4 읽기 전용 페이지
   (워크리스트·종합소견서에서 status=signed인 환자가 진입)
   ───────────────────────────────────────────────────────── */

export default function ReportViewerPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const encounterId = searchParams.get("encounter_id");
  const nav = useNavigate();
  const patient = findPatient(id);

  // 본문·서명·상태: 백엔드 우선, 없으면 로컬 캐시 폴백
  const [narrative, setNarrative] = useState<string>(() => getLocalReportEdits(id) ?? "");
  const [status, setStatus] = useState<ReportStatus>(() => getLocalReportStatus(id) ?? "signed");
  const [signature, setSignature] = useState<string>(() => getLocalReportSignature(id) ?? "");

  useEffect(() => {
    if (!encounterId) return;
    let stopped = false;
    (async () => {
      const r = await getReportByEncounter(encounterId);
      if (stopped || !r) return;
      setStatus(r.status);
      if (r.physician_edits) setNarrative(r.physician_edits);
      if (r.signed_by) setSignature(r.signed_by);
    })();
    return () => { stopped = true; };
  }, [encounterId]);

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-vuno-muted dark:bg-vuno-bg">
        환자를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-vuno-bg">
      {/* 얇은 상단 바 — 인쇄/닫기 (print 시 자동 숨김) */}
      <header className="print:hidden sticky top-0 z-10 bg-gradient-to-r from-brand-700 via-brand-600 to-ai-accent text-white shadow-md shadow-brand-900/10">
        <div className="max-w-[1100px] mx-auto px-5 h-12 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 뒤로
          </button>
          <div className="text-[13px] font-bold tracking-wide">
            소견서 뷰어 · <span className="font-extrabold">{patient.name}</span>
            <span className="ml-2 text-[10px] uppercase text-white/70 tracking-[0.2em]">
              {status === "signed" ? "Signed" : status === "reviewed" ? "Reviewed" : "Preliminary"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => window.print()}
              title="인쇄 / PDF 저장"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-bold bg-white text-brand-700 hover:bg-white/90 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> 인쇄
            </button>
            <button
              onClick={() => nav("/demo/reports")}
              title="종합소견서 목록"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> 닫기
            </button>
          </div>
        </div>
      </header>

      {/* A4 시트 — 화면에서도 인쇄에서도 동일하게 표시 */}
      <main className="py-8 print:py-0 flex justify-center">
        <ReportPrintSheet
          patient={patient}
          recommendation={patient.recommendation}
          narrative={narrative || "—"}
          status={status}
          signature={signature}
          screen
        />
      </main>
    </div>
  );
}
