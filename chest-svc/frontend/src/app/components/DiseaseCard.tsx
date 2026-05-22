import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCheck, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DiseaseCardProps {
  disease: {
    id: string;
    nameEn: string;
    nameKo: string;
    detected: boolean;
    confidence: number;
    severity?: 'mild' | 'moderate' | 'severe' | 'critical';
    verification: {
      densenet: boolean;
      unet: boolean;
      densenetScore?: number;
      unetMetric?: string;
      unetValue?: number;
      unetThreshold?: number;
    };
    evidence: string[];
    recommendation?: string;
    location?: string;
  };
}

export function DiseaseCard({ disease }: DiseaseCardProps) {
  const [expanded, setExpanded] = useState(false);

  const severityColors = {
    mild: 'bg-yellow-400 text-gray-900',
    moderate: 'bg-orange-500 text-white',
    severe: 'bg-red-500 text-white',
    critical: 'bg-red-600 text-white',
  };
  const severityLabels = {
    mild: 'Mild',
    moderate: 'Moderate',
    severe: 'Severe',
    critical: 'Critical',
  };

  const getBadgeColor = () => {
    if (!disease.detected) return 'bg-gray-400';
    if (disease.severity === 'critical' || disease.severity === 'severe') return 'bg-red-600';
    if (disease.severity === 'moderate') return 'bg-orange-600';
    return 'bg-yellow-500';
  };

  const getVerificationLabel = () => {
    if (disease.verification.densenet && disease.verification.unet) {
      return { icon: <CheckCheck size={14} />, text: '이중 확인', color: 'text-green-600' };
    }
    if (disease.verification.densenet) {
      return { icon: <Check size={14} />, text: 'DenseNet 단독', color: 'text-orange-600' };
    }
    if (disease.verification.unet) {
      return { icon: <Check size={14} />, text: 'UNet 단독', color: 'text-blue-600' };
    }
    return null;
  };

  const vLabel = getVerificationLabel();

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-300 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`${getBadgeColor()} w-2.5 h-2.5 rounded-full ${disease.detected ? 'animate-pulse' : ''}`} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-900 text-sm">{disease.nameEn}</span>
              <span className="text-gray-500 text-xs">{disease.nameKo}</span>
            </div>
            {disease.detected && disease.severity && (
              <span className={`${severityColors[disease.severity]} text-[10px] px-1.5 py-0.5 rounded mt-0.5 inline-block`}>
                {severityLabels[disease.severity]}
              </span>
            )}
          </div>
        </div>
        {vLabel && (
          <div className={`flex items-center gap-1 ${vLabel.color}`}>
            {vLabel.icon}
            <span className="text-[10px]">{vLabel.text}</span>
          </div>
        )}
      </div>

      {/* Confidence Bar */}
      <div className="mb-1.5">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-gray-500">Confidence</span>
          <span className="text-gray-900 font-medium">{(disease.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${disease.detected ? getBadgeColor() : 'bg-gray-400'} transition-all duration-500`}
            style={{ width: `${disease.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Expandable — evidence + verification + recommendation */}
      {disease.detected && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>교차검증 상세</span>
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1.5 text-xs bg-gray-50 p-2.5 rounded border border-gray-200">
                  {/* Evidence */}
                  {disease.evidence.length > 0 && (
                    <div className="space-y-0.5">
                      {disease.evidence.map((e, i) => (
                        <div key={i} className="text-gray-600">· {e}</div>
                      ))}
                    </div>
                  )}

                  {/* Verification detail */}
                  <div className="flex gap-3 pt-1 border-t border-gray-200">
                    <div className="flex items-center gap-1 text-gray-700">
                      {disease.verification.densenet
                        ? <Check size={13} className="text-green-600" />
                        : <X size={13} className="text-gray-400" />}
                      <span>DenseNet {disease.verification.densenetScore?.toFixed(2)}</span>
                    </div>
                    {disease.verification.unetMetric && (
                      <div className="flex items-center gap-1 text-gray-700">
                        {disease.verification.unet
                          ? <Check size={13} className="text-green-600" />
                          : <X size={13} className="text-gray-400" />}
                        <span>UNet {disease.verification.unetMetric}
                          {disease.verification.unetValue != null && ` ${disease.verification.unetValue.toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  {disease.location && (
                    <div className="text-gray-600">위치: {disease.location}</div>
                  )}

                  {/* Recommendation */}
                  {disease.recommendation && (
                    <div className="text-blue-700 font-medium pt-1 border-t border-gray-200">
                      권장: {disease.recommendation}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
