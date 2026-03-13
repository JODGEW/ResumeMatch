import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './FileDropzone.css';

interface Props {
  file: File | null;
  onFileSelect: (file: File) => void;
}

export function FileDropzone({ file, onFileSelect }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFileSelect(accepted[0]);
      }
    },
    [onFileSelect],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'dropzone--active' : ''} ${file ? 'dropzone--has-file' : ''}`}
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
      </div>
    </div>
  );
}
