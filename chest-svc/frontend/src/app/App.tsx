import { useState, useEffect, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { ImageViewer } from './components/ImageViewer';
import { DiseasePanel } from './components/DiseasePanel';
import { MeasurementPanel } from './components/MeasurementPanel';
import { SummaryBar } from './components/SummaryBar';
import { RawDataViewer } from './components/RawDataViewer';
import { Activity } from 'lucide-react';
import { PipelineBar } from './components/PipelineBar';
import { analyzeChestXray, type AnalysisResult } from './api';

const DISEASE_LABELS: Record<string, string> = {
  Atelectasis: '무기폐',
  Cardiomegaly: '심비대',
  Edema: '폐부종',
  Enlarged_Cardiomediastinum: '종격동 확장',
  No_Finding: '정상',
  Pleural_Effusion: '흉수',
  Pneumothorax: '기흉',
};

interface TestCases {
  [disease: string]: { images: string[]; count: number };
}

export default function App() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCases | null>(null);

  // 테스트 케이스 목록 로드
  useEffect(() => {
    fetch('/test-cases')
      .then((r) => r.json())
      .then(setTestCases)
      .catch(() => {});
  }, []);

  // 이미지 분석 실행
  const runAnalysis = useCallback(async (imageDataUrl: string) => {
    setError(null);
    setResult(null);
    setUploadedImage(imageDataUrl);
    setIsAnalyzing(true);

    try {
      const analysisResult = await analyzeChestXray(imageDataUrl);
      setResult(analysisResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // 파일 업로드 핸들러
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      runAnalysis(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 테스트 케이스 선택 핸들러
  const handleTestCaseSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;

    try {
      const resp = await fetch(`/test-images/${val}`);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = (ev) => {
        runAnalysis(ev.target?.result as string);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setError(`이미지 로드 실패: ${err}`);
    }
  };

  const handleReset = () => {
    setUploadedImage(null);
    setResult(null);
    setError(null);
    setIsAnalyzing(false);
  };

  const noFinding = result ? result.diseases.every((d) => !d.detected) : false;

  return (
    <div className="size-full bg-white text-gray-900 p-6 flex flex-col min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Activity size={32} className="text-blue-600" />
          <div>
            <h1 className="text-3xl">흉부 X선 AI 분석 시스템</h1>
            <p className="text-gray-600">chest-svc-v2 — 6개 질환 탐지 + UNet 세그멘테이션</p>
          </div>
        </div>
      </div>

      {!uploadedImage ? (
        /* Upload Screen */
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-2xl w-full space-y-6">
            {/* 테스트 케이스 선택 */}
            {testCases && Object.keys(testCases).length > 0 && (
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  테스트 이미지 선택 (질환별 5장)
                </label>
                <select
                  onChange={handleTestCaseSelect}
                  defaultValue=""
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="" disabled>
                    -- 테스트 케이스 선택 --
                  </option>
                  {Object.entries(testCases).map(([disease, data]) => (
                    <optgroup
                      key={disease}
                      label={`${disease} (${DISEASE_LABELS[disease] || disease}) — ${data.count}장`}
                    >
                      {data.images.map((img) => (
                        <option key={`${disease}/${img}`} value={`${disease}/${img}`}>
                          {img}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {/* 직접 업로드 */}
            <FileUpload onFileSelect={handleFileSelect} />
          </div>
        </div>
      ) : (
        /* Analysis Screen */
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700">
              <strong>API Error:</strong> {error}
            </div>
          )}

          {/* Summary Bar */}
          {result && (
            <SummaryBar
              riskLevel={result.riskLevel}
              summary={result.summary}
              findingsText={result.findingsText}
              impression={result.impression}
              processingTime={result.processingTime}
              noFinding={noFinding}
            />
          )}

          {/* Pipeline Bar */}
          {result && <PipelineBar p={result.pipelineInfo} />}

          {/* Main Content — 고정 높이, 우측 패널 스크롤 */}
          <div className="grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 260px)' }}>
            {/* Image Viewer - Left 60% */}
            <div className="col-span-7 min-h-0">
              {isAnalyzing ? (
                <div className="bg-gray-100 rounded-lg border border-gray-300 h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">AI 분석 중...</p>
                  </div>
                </div>
              ) : (
                <ImageViewer
                  imageUrl={uploadedImage}
                  segmentationMask={result?.segmentationMask ?? undefined}
                  riskLevel={result?.riskLevel ?? 'routine'}
                  overlayCoords={result?.overlayCoords}
                  viewType={result?.viewType ?? 'PA'}
                />
              )}
            </div>

            {/* Right Panel - 40%, 내부 스크롤 */}
            <div className="col-span-5 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-4">
              {/* Disease Detection Results */}
              <div>
                {result ? (
                  <DiseasePanel diseases={result.diseases} />
                ) : (
                  <div className="bg-gray-100 rounded-lg border border-gray-300 h-full flex items-center justify-center">
                    <p className="text-gray-500">
                      {isAnalyzing ? '분석 중...' : '분석 대기 중...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Measurements */}
              <div>
                {result ? (
                  <MeasurementPanel measurements={result.measurements} />
                ) : (
                  <div className="bg-gray-100 rounded-lg border border-gray-300 h-full flex items-center justify-center">
                    <p className="text-gray-500">
                      {isAnalyzing ? '분석 중...' : '측정 대기 중...'}
                    </p>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>

          {/* Raw Data Viewer */}
          {result && (
            <div className="mt-4">
              <RawDataViewer
                requestData={result.rawRequest}
                responseData={result.rawResponse}
              />
            </div>
          )}

          {/* New Analysis Button */}
          <div className="flex justify-center pt-2">
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              새 이미지 분석
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
