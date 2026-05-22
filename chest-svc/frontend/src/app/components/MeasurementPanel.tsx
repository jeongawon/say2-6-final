import { AlertCircle, CheckCircle } from 'lucide-react';

interface MeasurementPanelProps {
  measurements: {
    ctr: { value: number; status: 'normal' | 'abnormal'; threshold: number };
    cpAngleLeft: { value: number; status: 'normal' | 'abnormal'; threshold: number };
    cpAngleRight: { value: number; status: 'normal' | 'abnormal'; threshold: number };
    lungAreaRatio: { value: number; status: 'normal' | 'abnormal' };
    mediastinum: { status: 'normal' | 'abnormal'; description: string };
    trachea: { status: 'normal' | 'abnormal'; description: string };
    diaphragm: { status: 'normal' | 'abnormal'; description: string };
  };
}

export function MeasurementPanel({ measurements }: MeasurementPanelProps) {
  const getStatusIcon = (status: 'normal' | 'abnormal') => {
    return status === 'normal' ? (
      <CheckCircle size={18} className="text-green-600" />
    ) : (
      <AlertCircle size={18} className="text-red-600" />
    );
  };

  const getStatusText = (status: 'normal' | 'abnormal') => {
    return status === 'normal' ? '정상' : '이상';
  };

  const getStatusColor = (status: 'normal' | 'abnormal') => {
    return status === 'normal' ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 h-full overflow-auto shadow-sm">
      <h2 className="text-xl mb-4 text-gray-900">UNet 측정값</h2>
      <div className="space-y-3">
        {/* CTR */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                {getStatusIcon(measurements.ctr.status)}
                <span className="font-medium text-gray-900">CTR (심흉비)</span>
              </div>
              <div className="mt-1 ml-6">
                <span className="text-2xl text-gray-900 font-mono">{measurements.ctr.value.toFixed(2)}</span>
              </div>
            </div>
            <div className={`text-right ${getStatusColor(measurements.ctr.status)}`}>
              {measurements.ctr.status === 'abnormal' ? (
                <>
                  <div>⚠️ 심비대</div>
                  <div className="text-sm">({'>'}{measurements.ctr.threshold.toFixed(2)})</div>
                </>
              ) : (
                <div>{getStatusText(measurements.ctr.status)}</div>
              )}
            </div>
          </div>
        </div>

        {/* CP Angle Left (데이터=viewer좌=환자우) */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                {getStatusIcon(measurements.cpAngleLeft.status)}
                <span className="font-medium text-gray-900">CP angle 우(R)</span>
              </div>
              <div className="mt-1 ml-6">
                <span className="text-2xl text-gray-900 font-mono">{measurements.cpAngleLeft.value.toFixed(1)}°</span>
              </div>
            </div>
            <div className={`text-right ${getStatusColor(measurements.cpAngleLeft.status)}`}>
              {measurements.cpAngleLeft.status === 'abnormal' ? (
                <>
                  <div>⚠️ 둔화</div>
                  <div className="text-sm">({'<'}{measurements.cpAngleLeft.threshold}°)</div>
                </>
              ) : (
                <div>{getStatusText(measurements.cpAngleLeft.status)}</div>
              )}
            </div>
          </div>
        </div>

        {/* CP Angle Right (데이터=viewer우=환자좌) */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                {getStatusIcon(measurements.cpAngleRight.status)}
                <span className="font-medium text-gray-900">CP angle 좌(L)</span>
              </div>
              <div className="mt-1 ml-6">
                <span className="text-2xl text-gray-900 font-mono">{measurements.cpAngleRight.value.toFixed(1)}°</span>
              </div>
            </div>
            <div className={`text-right ${getStatusColor(measurements.cpAngleRight.status)}`}>
              {measurements.cpAngleRight.status === 'abnormal' ? (
                <>
                  <div>⚠️ 둔화</div>
                  <div className="text-sm">({'<'}{measurements.cpAngleRight.threshold}°)</div>
                </>
              ) : (
                <div>{getStatusText(measurements.cpAngleRight.status)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Lung Area Ratio */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                {getStatusIcon(measurements.lungAreaRatio.status)}
                <span className="font-medium text-gray-900">폐 면적비</span>
              </div>
              <div className="mt-1 ml-6">
                <span className="text-2xl text-gray-900 font-mono">{measurements.lungAreaRatio.value.toFixed(3)}</span>
              </div>
            </div>
            <div className={getStatusColor(measurements.lungAreaRatio.status)}>
              {getStatusText(measurements.lungAreaRatio.status)}
            </div>
          </div>
        </div>

        {/* Mediastinum */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(measurements.mediastinum.status)}
              <span className="font-medium text-gray-900">종격동</span>
            </div>
            <div className={getStatusColor(measurements.mediastinum.status)}>
              {measurements.mediastinum.description}
            </div>
          </div>
        </div>

        {/* Trachea */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(measurements.trachea.status)}
              <span className="font-medium text-gray-900">기관 편위</span>
            </div>
            <div className={getStatusColor(measurements.trachea.status)}>
              {measurements.trachea.description}
            </div>
          </div>
        </div>

        {/* Diaphragm */}
        <div className="bg-white rounded p-3 border border-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(measurements.diaphragm.status)}
              <span className="font-medium text-gray-900">횡격막</span>
            </div>
            <div className={getStatusColor(measurements.diaphragm.status)}>
              {measurements.diaphragm.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
