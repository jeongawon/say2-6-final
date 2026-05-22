import { Clock, AlertTriangle, FileText } from 'lucide-react';

interface SummaryBarProps {
  riskLevel: 'critical' | 'urgent' | 'routine';
  summary: string;
  findingsText: string;
  impression: string;
  processingTime: number;
  noFinding?: boolean;
}

export function SummaryBar({
  riskLevel,
  findingsText,
  impression,
  processingTime,
  noFinding = false,
}: SummaryBarProps) {
  const riskColors = {
    critical: 'bg-red-600',
    urgent: 'bg-orange-600',
    routine: 'bg-green-600',
  };

  const riskLabels = {
    critical: 'CRITICAL',
    urgent: 'URGENT',
    routine: 'ROUTINE',
  };

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-sm overflow-hidden">
      {/* Header — Risk Level + Processing Time */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div
            className={`${riskColors[riskLevel]} text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-1.5`}
          >
            {(riskLevel === 'critical' || riskLevel === 'urgent') && (
              <AlertTriangle size={16} />
            )}
            {riskLabels[riskLevel]}
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <FileText size={16} />
            <span className="font-medium text-gray-900 text-sm">Radiology Report</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500 text-sm">
          <Clock size={14} />
          <span>{processingTime}ms</span>
        </div>
      </div>

      {/* Report Body */}
      <div className="px-5 py-4">
        {noFinding ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle size={20} />
            <div>
              <p className="font-medium">No acute cardiopulmonary abnormality</p>
              <p className="text-sm text-gray-500">All 6 diseases negative</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* FINDINGS */}
            {findingsText && (
              <div>
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">
                  Findings
                </h3>
                <p className="text-sm text-gray-800 leading-relaxed">
                  {findingsText}
                </p>
              </div>
            )}

            {/* IMPRESSION */}
            {impression && (
              <div>
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">
                  Impression
                </h3>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                  {impression}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckCircle({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
