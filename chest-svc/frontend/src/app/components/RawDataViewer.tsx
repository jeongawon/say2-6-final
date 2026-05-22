import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface RawDataViewerProps {
  requestData: any;
  responseData: any;
}

export function RawDataViewer({ requestData, responseData }: RawDataViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const data = activeTab === 'request' ? requestData : responseData;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const syntaxHighlight = (json: any) => {
    let jsonStr = JSON.stringify(json, null, 2);

    // Truncate base64 strings
    jsonStr = jsonStr.replace(
      /"(image_base64|mask_base64)":\s*"([^"]{50})[^"]*"/g,
      '"$1": "$2... (truncated)"'
    );

    return jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(".*?"):/g, '<span class="text-blue-600">$1</span>:')
      .replace(/:\s*"(.*?)"/g, ': <span class="text-green-600">"$1"</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-orange-600">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="text-red-600">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="text-gray-400">$1</span>');
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-gray-700">Raw Data</span>
          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
            개발자/시연용
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={20} className="text-gray-600" />
        ) : (
          <ChevronDown size={20} className="text-gray-600" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-300">
          {/* Tabs */}
          <div className="flex border-b border-gray-300">
            <button
              onClick={() => setActiveTab('request')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'request'
                  ? 'bg-gray-100 text-gray-900 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Request (입력 데이터)
            </button>
            <button
              onClick={() => setActiveTab('response')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'response'
                  ? 'bg-gray-100 text-gray-900 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Response (출력 데이터)
            </button>
          </div>

          {/* JSON Content */}
          <div className="relative">
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded flex items-center gap-1.5 transition-colors z-10"
            >
              {copied ? (
                <>
                  <Check size={14} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>

            <pre className="p-4 bg-gray-100 overflow-x-auto max-h-96 text-xs font-mono text-gray-900">
              <code
                className="font-mono"
                dangerouslySetInnerHTML={{
                  __html: syntaxHighlight(
                    activeTab === 'request' ? requestData : responseData
                  ),
                }}
              />
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
