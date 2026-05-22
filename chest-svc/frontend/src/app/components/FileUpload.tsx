import { Upload } from 'lucide-react';
import { useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export function FileUpload({ onFileSelect }: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      className="border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg p-16 text-center hover:border-blue-600 transition-colors cursor-pointer"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <Upload className="mx-auto mb-4 text-gray-600" size={48} />
      <p className="mb-2 text-gray-900">흉부 X선 이미지를 드래그하거나 클릭하여 업로드</p>
      <p className="text-gray-500">지원 형식: JPG, PNG, DICOM</p>
      <input
        id="file-input"
        type="file"
        accept="image/*,.dcm"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
