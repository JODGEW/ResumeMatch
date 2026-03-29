import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import './FileDropzone.css';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB — matches backend presigned URL constraint

interface Props {
  file: File | null;
  onFileSelect: (file: File) => void;
}

function getErrorMessage(rejection: FileRejection): string {
  const error = rejection.file && rejection.errors[0];
  if (!error) return 'File not accepted.';
  if (error.code === 'file-invalid-type') return 'Only PDF files are accepted.';
  if (error.code === 'file-too-large') return `File too large. Maximum size is 5 MB.`;
  return error.message;
}

export function FileDropzone({ file, onFileSelect }: Props) {
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
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'dropzone--active' : ''} ${file ? 'dropzone--has-file' : ''} ${error ? 'dropzone--error' : ''}`}
    >
      <input {...getInputProps()} />

      <div className="dropzone__content">
        {file ? (
          <>
            <div className="dropzone__icon dropzone__icon--file">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="4" width="24" height="32" rx="4" stroke="var(--success)" strokeWidth="2" />
                <path d="M14 16h12M14 22h12M14 28h8" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="dropzone__filename">{file.name}</span>
            <span className="dropzone__size">
              {(file.size / 1024).toFixed(1)} KB
            </span>
            <span className="dropzone__hint">Drop a new file to replace</span>
          </>
        ) : (
          <>
            <div className="dropzone__icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M24 32V16m0 0l-6 6m6-6l6 6"
                  stroke={isDragActive ? 'var(--accent)' : 'var(--text-muted)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M40 30v4a4 4 0 01-4 4H12a4 4 0 01-4-4v-4"
                  stroke={isDragActive ? 'var(--accent)' : 'var(--text-muted)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="dropzone__text">
              {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume PDF'}
            </span>
            <span className="dropzone__hint">or click to browse files</span>
          </>
        )}

        {error && (
          <span className="dropzone__error">{error}</span>
        )}
      </div>
    </div>
  );
}
