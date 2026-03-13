import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDropzone } from '../components/FileDropzone';
import { requestUploadUrl, uploadFileToS3 } from '../api/upload';
import './Upload.css';

type Stage = 'idle' | 'requesting' | 'storing' | 'uploading' | 'done';

const STAGE_LABELS: Record<Stage, string> = {
  idle: '',
  requesting: 'Getting upload URL...',
  storing: 'Saving analysis record...',
  uploading: 'Uploading resume to S3...',
  done: 'Redirecting to results...',
};

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const isSubmitting = stage !== 'idle';
  const canSubmit = file && jobDescription.trim().length > 0 && !isSubmitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !jobDescription.trim()) return;

    setError('');

    try {
      // Step 1: Request presigned URL + store JD in one call
      setStage('requesting');
      const { presignedUrl, presignedFields, analysisId } = await requestUploadUrl(file.name, jobDescription);

      // Step 2: Upload file directly to S3
      setStage('uploading');
      await uploadFileToS3(presignedUrl, presignedFields, file);

      // Step 3: Navigate to results
      setStage('done');
      navigate(`/results/${analysisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setStage('idle');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <h1>New Analysis</h1>
        <p>Upload your resume and paste the job description to get started</p>
      </div>

      {error && (
        <div className="upload-error animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="upload-grid">
        {/* Left column — JD */}
        <div className="upload-grid__col animate-in stagger-1">
          <div className="card upload-panel">
            <div className="upload-panel__header">
              <div className="upload-panel__step">1</div>
              <div>
                <h3>Job Description</h3>
                <p className="text-secondary">Paste the full job posting</p>
              </div>
            </div>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here...&#10;&#10;Include requirements, responsibilities, and preferred qualifications for the best analysis."
              rows={16}
              className="upload-panel__textarea"
              disabled={isSubmitting}
            />
            <div className="upload-panel__count">
              {jobDescription.length > 0 && (
                <span className="text-muted">
                  {jobDescription.split(/\s+/).filter(Boolean).length} words
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right column — File + Submit */}
        <div className="upload-grid__col animate-in stagger-2">
          <div className="card upload-panel">
            <div className="upload-panel__header">
              <div className="upload-panel__step">2</div>
              <div>
                <h3>Resume</h3>
                <p className="text-secondary">Upload your resume as a PDF</p>
              </div>
            </div>
            <FileDropzone file={file} onFileSelect={setFile} />
          </div>

          <button
            type="submit"
            className="btn btn-primary upload-submit"
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <span
                  className="loading-spinner"
                  style={{ width: 16, height: 16, borderWidth: 2 }}
                />
                {STAGE_LABELS[stage]}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9h12M9 3l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Analyze Resume
              </>
            )}
          </button>

          {isSubmitting && (
            <div className="upload-progress animate-in">
              <div className="upload-progress__track">
                <div
                  className="upload-progress__bar"
                  style={{
                    width:
                      stage === 'requesting' ? '25%'
                        : stage === 'storing' ? '50%'
                          : stage === 'uploading' ? '75%'
                            : '100%',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
