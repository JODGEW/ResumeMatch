import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import './FileDropzone.css';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB — matches backend presigned URL constraint

interface Props {
  onFileSelect: (file: File) => void;
}

function getErrorMessage(rejection: FileRejection): string {
  const error = rejection.file && rejection.errors[0];
  if (!error) return 'File not accepted.';
  if (error.code === 'file-invalid-type') return 'Only PDF files are accepted.';
  if (error.code === 'file-too-large') return `File too large. Maximum size is 5 MB.`;
  return error.message;
}

export function FileDropzone({ onFileSelect }: Props) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setError(getErrorMessage(rejections[0]));
        return;
      }
      if (accepted.length > 0) {
        setError(null);
        onFileSelect(accepted[0]);
      }
    },
    [onFileSelect],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: MAX_SIZE,
    multiple: false,
  });

  return (
    <>
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'dropzone--active' : ''} ${error ? 'dropzone--error' : ''}`}
      >
        <input {...getInputProps()} />

        <span className="dropzone__icon">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 11V3M5 6l3-3 3 3M3 13h10"
              stroke="var(--brand-tint-text)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="dropzone__title">
          {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume PDF'}
        </span>
        <span className="dropzone__hint">or click to browse files</span>
      </div>

      {error && <p className="dropzone__error">{error}</p>}
    </>
  );
}
