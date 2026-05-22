import { DiseaseCard } from './DiseaseCard';
import type { DiseaseUI } from '../api';

interface DiseasePanelProps {
  diseases: DiseaseUI[];
}

export function DiseasePanel({ diseases }: DiseasePanelProps) {
  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 h-full overflow-auto shadow-sm">
      <h2 className="text-lg mb-3 text-gray-900">질환 탐지 결과</h2>
      <div className="space-y-2">
        {diseases.map((disease) => (
          <DiseaseCard key={disease.id} disease={disease} />
        ))}
      </div>
    </div>
  );
}
