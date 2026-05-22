import type { PipelineInfo } from '../api';

export function PipelineBar({ p }: { p: PipelineInfo }) {
  const riskColor = p.riskLevel === 'critical' ? 'bg-red-600' : p.riskLevel === 'urgent' ? 'bg-orange-600' : 'bg-green-600';

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 shadow-sm text-xs text-gray-600">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Pipeline stages */}
        <span className="text-gray-400 font-medium">3-Stage:</span>
        <span>
          <span className="text-blue-700 font-medium">UNet</span> {p.segMs}ms
          <span className="text-gray-300 mx-1">→</span>
          <span className="text-green-700 font-medium">DenseNet</span> {p.clsMs}ms
          <span className="text-gray-300 mx-1">→</span>
          <span className="text-purple-700 font-medium">Logic</span> {p.logicMs}ms
        </span>

        <span className="text-gray-300">|</span>

        {/* Key measurements */}
        <span>{p.view} View</span>
        <span>CTR <strong className={p.ctr > 0.5 ? 'text-red-600' : 'text-green-600'}>{p.ctr.toFixed(2)}</strong></span>
        <span>폐비 <strong className={p.lungRatio < 0.85 || p.lungRatio > 1.15 ? 'text-orange-600' : 'text-green-600'}>{p.lungRatio.toFixed(2)}</strong></span>
        <span>CP R<strong>{p.cpLeft.toFixed(0)}°</strong>/L<strong>{p.cpRight.toFixed(0)}°</strong></span>
        {!p.tracheaMidline && <span className="text-red-600 font-medium">기관 {p.tracheaDev}편위</span>}

        <span className="text-gray-300">|</span>

        {/* Result */}
        <span><strong className="text-gray-800">{p.detectedCount}개</strong> 탐지</span>
        <span className={`${riskColor} text-white px-2 py-0.5 rounded font-bold`}>
          {p.riskLevel.toUpperCase()}
        </span>
        {p.riskReasons.length > 0 && (
          <span className="text-gray-500">{p.riskReasons.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
