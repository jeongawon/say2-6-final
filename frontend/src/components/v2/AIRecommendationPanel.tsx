import { Check, X, Pencil, Sparkles, FileText, ExternalLink, Lock } from "lucide-react";
import { Button } from "./ui/Button";
import { RiskBadge, type RiskLevel } from "./RiskBadge";
import { cn } from "../../lib/cn";
import { useAuth, canApproveAI } from "../../lib/v2/auth";

export interface SimilarCase {
  id: string;
  similarity: number; // 0~1
}

export interface AIRecommendation {
  risk: RiskLevel;
  diagnosis: string;
  reasons: string[];
  confidence: number; // 0~1
  recommendations: string[];
  similarCases: SimilarCase[];
}

interface Props {
  data: AIRecommendation;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onOpenReport?: () => void;
  className?: string;
}

export function AIRecommendationPanel({ data, onApprove, onReject, onEdit, onOpenReport, className }: Props) {
  const { user } = useAuth();
  const canDecide = canApproveAI(user?.role);
  const confidencePct = Math.round(data.confidence * 100);
  const confidenceColor =
    data.confidence >= 0.9 ? "bg-brand-500" :
    data.confidence >= 0.7 ? "bg-yellow-500" :
    "bg-slate-400";

  return (
    <aside
      className={cn(
        "rounded-xl border border-ai-border bg-ai-bg/60 backdrop-blur-sm",
        "flex flex-col gap-5 p-5",
        className,
      )}
    >
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-2 pb-3 border-b border-ai-border">
        <div className="inline-flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-ai-accent grid place-items-center shadow-ai">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-brand-700 dark:text-brand-300">AI 권고</div>
            <div className="text-xs text-slate-500 dark:text-vuno-muted">say-6 멀티모달 분석</div>
          </div>
        </div>
        <span className="text-xs text-slate-500 dark:text-vuno-muted font-numeric">v1.2</span>
      </header>

      {/* 종합 판정 */}
      <section>
        <div className="text-xs font-medium text-slate-500 dark:text-vuno-muted mb-2">📊 종합 판정</div>
        <div className="space-y-2">
          <RiskBadge level={data.risk} size="lg" />
          <p className="text-base font-semibold text-slate-900 dark:text-white">{data.diagnosis}</p>
        </div>
      </section>

      {/* 근거 */}
      <section>
        <div className="text-xs font-medium text-slate-500 dark:text-vuno-muted mb-2">근거</div>
        <ul className="space-y-1.5">
          {data.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="text-brand-500 mt-0.5">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 신뢰도 */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-vuno-muted">신뢰도</span>
          <span className="text-xs font-numeric font-semibold text-slate-700 dark:text-slate-200">{confidencePct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-vuno-elevated overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", confidenceColor)}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </section>

      {/* 권고 */}
      <section>
        <div className="text-xs font-medium text-slate-500 dark:text-vuno-muted mb-2">💡 권고</div>
        <ol className="space-y-1.5">
          {data.recommendations.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="font-numeric font-semibold text-brand-600 min-w-[1.25rem]">{i + 1}.</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 유사 사례 */}
      {data.similarCases.length > 0 && (
        <section>
          <div className="text-xs font-medium text-slate-500 dark:text-vuno-muted mb-2">📚 유사 사례</div>
          <div className="flex flex-wrap gap-2">
            {data.similarCases.map((c) => (
              <button
                key={c.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border text-xs hover:border-brand-400 transition-colors"
              >
                <span className="font-numeric">{c.id}</span>
                <span className="text-slate-400 dark:text-vuno-dim">·</span>
                <span className="text-brand-600 dark:text-brand-300 font-medium">{Math.round(c.similarity * 100)}%</span>
                <ExternalLink className="h-3 w-3 text-slate-400 dark:text-vuno-dim" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 의사 결정 */}
      <section className="pt-3 border-t border-ai-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500 dark:text-vuno-muted">의사 결정</div>
          {!canDecide && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-vuno-dim">
              <Lock className="h-3 w-3" />
              의사 권한 필요
            </span>
          )}
        </div>
        <Button
          variant="primary"
          fullWidth
          onClick={onApprove}
          disabled={!canDecide}
          title={!canDecide ? "의사 권한이 필요합니다" : ""}
        >
          <Check className="h-4 w-4" />
          승인
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={!canDecide}
            title={!canDecide ? "의사 권한이 필요합니다" : ""}
          >
            <X className="h-4 w-4" />
            거부
          </Button>
          <Button
            variant="outline"
            onClick={onEdit}
            disabled={!canDecide}
            title={!canDecide ? "의사 권한이 필요합니다" : ""}
          >
            <Pencil className="h-4 w-4" />
            수정 승인
          </Button>
        </div>
      </section>

      {/* 소견서 작성 */}
      <Button
        variant="ai"
        fullWidth
        onClick={onOpenReport}
        disabled={!canDecide}
        title={!canDecide ? "의사만 소견서를 작성할 수 있습니다" : ""}
      >
        <FileText className="h-4 w-4" />
        {canDecide ? "종합 소견서 작성" : "소견서 보기 (의사만 작성)"}
      </Button>
    </aside>
  );
}
