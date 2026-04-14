import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FileDropzone } from '../components/FileDropzone';
import { LastResumeCard } from '../components/LastResumeCard';
import { requestUploadUrl, requestUploadWithReuse, uploadFileToS3, fetchLastResume } from '../api/upload';
import '../components/LastResumeCard.css';
import './Upload.css';

const DEMO_EMAIL = 'demo123@resumeapp.com';
const STORAGE_KEY = 'resumematch_last_resume';

interface LastResumeMetadata {
  analysisId: string;
  fileName: string;
  uploadedAt: number;
}

type Stage = 'idle' | 'requesting' | 'processing' | 'uploading' | 'done';

const STAGE_LABELS: Record<Stage, string> = {
  idle: '',
  requesting: 'Getting upload URL...',
  processing: 'Preparing analysis...',
  uploading: 'Uploading resume to S3...',
  done: 'Redirecting to results...',
};

export function Upload() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ jd?: string; resume?: string }>({});
  const [touched, setTouched] = useState<{ jd?: boolean; resume?: boolean }>({});
  const [submitError, setSubmitError] = useState('');
  const isDemo = user?.email === DEMO_EMAIL;

  const [lastResume, setLastResume] = useState<LastResumeMetadata | null>(() => {
    if (isDemo) return null;
    // Sync fallback — backend fetch below will override if available
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    return null;
  });

  // Fetch last resume from backend (cross-device sync), update localStorage if newer
  useEffect(() => {
    if (isDemo) return;
    fetchLastResume()
      .then((remote) => {
        if (!remote) return;
        const remoteTime = new Date(remote.uploadedAt).getTime();
        const localTime = lastResume?.uploadedAt ?? 0;
        if (remoteTime > localTime) {
          const metadata: LastResumeMetadata = {
            analysisId: remote.analysisId,
            fileName: remote.fileName,
            uploadedAt: remoteTime,
          };
          setLastResume(metadata);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
        }
      })
      .catch(() => {
        // Backend unavailable — localStorage fallback already loaded
      });
  }, []);
  const [isChangingResume, setIsChangingResume] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();

  const isSubmitting = stage !== 'idle';
  // Resume source: either a new file or the saved last resume (auto-selected)
  const activeResume = file || lastResume;
  // Reuse path when last resume is the active source (not changing, no new file)
  const isReusing = !file && !!lastResume && !isChangingResume;

  function saveLastResume(analysisId: string, fileName: string) {
    if (isDemo) return;
    const metadata: LastResumeMetadata = { analysisId, fileName, uploadedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    setLastResume(metadata);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate — show global + inline errors together
    const missingJd = !jobDescription.trim();
    const missingResume = isChangingResume ? !file : !activeResume;
    if (missingJd || missingResume) {
      const parts: string[] = [];
      if (missingJd) parts.push('job description');
      if (missingResume) parts.push('resume');
      setSubmitError(`Please add a ${parts.join(' and ')} to continue`);
      setTouched({ jd: true, resume: true });
      setFieldErrors({
        ...(missingJd ? { jd: 'Job description is required' } : {}),
        ...(missingResume ? { resume: 'Resume is required' } : {}),
      });
      return;
    }

    setSubmitError('');
    setFieldErrors({});
    setError('');

    try {
      if (isReusing && lastResume) {
        // REUSE PATH — no S3 upload, backend copies existing object
        setStage('requesting');
        const { analysisId } = await requestUploadWithReuse(
          lastResume.analysisId,
          jobDescription
        );

        saveLastResume(analysisId, lastResume.fileName);

        // Smooth progress: requesting (40%) → processing (80%) → done (100%)
        setStage('processing');
        await new Promise(r => setTimeout(r, 300));
        setStage('done');
        await new Promise(r => setTimeout(r, 200));
        navigate(`/results/${analysisId}`);
      } else if (file) {
        // NORMAL PATH
        setStage('requesting');
        const { presignedUrl, presignedFields, analysisId } = await requestUploadUrl(file.name, jobDescription);

        setStage('uploading');
        try {
          await uploadFileToS3(presignedUrl, presignedFields, file);
        } catch (uploadErr) {
          // S3 presigned POST may fail to return a readable response (CORS)
          // but the file upload itself often succeeds. The backend already has
          // the analysis record in 'processing' state. Navigate to results and
          // let polling determine if the upload actually went through.
          console.warn('S3 upload response error (file may have uploaded successfully):', uploadErr);
        }

        saveLastResume(analysisId, file.name);

        setStage('done');
        navigate(`/results/${analysisId}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; errorMessage?: string; message?: string } } };
      const status = axiosErr?.response?.status;

      // If reuse fails with 404, the original resume is gone — clear and fall back to dropzone
      if (isReusing && status === 404) {
        localStorage.removeItem(STORAGE_KEY);
        setLastResume(null);
        setIsChangingResume(false);
        setError('Previous resume is no longer available. Please upload again.');
      } else {
        const axiosData = axiosErr?.response?.data;
        const message = axiosData?.error
          || axiosData?.errorMessage
          || axiosData?.message
          || (err instanceof Error ? err.message : null)
          || 'Upload failed. Please try again.';
        setError(message);
      }
      setStage('idle');
    }
  }

  function getProgressWidth(): string {
    if (isReusing) {
      if (stage === 'requesting') return '40%';
      if (stage === 'processing') return '80%';
      if (stage === 'done') return '100%';
    } else {
      if (stage === 'requesting') return '25%';
      if (stage === 'uploading') return '75%';
      if (stage === 'done') return '100%';
    }
    return '0%';
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
          <span>
            {error}
            {isChangingResume && lastResume && (
              <button
                type="button"
                className="upload-error__revert"
                onClick={() => {
                  setIsChangingResume(false);
                  setFile(null);
                  setError('');
                  setFieldErrors(f => ({ ...f, resume: undefined }));
                  if (jobDescription.trim()) setSubmitError('');
                }}
              >
                Keep {lastResume.fileName}
              </button>
            )}
          </span>
        </div>
      )}

      {submitError && (
        <div className="upload-error animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {submitError}
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
                <p className="text-secondary">Paste test from posting</p>
              </div>
            </div>
            <textarea
              value={jobDescription}
              onChange={(e) => {
                const val = e.target.value;
                setJobDescription(val);
                if (!touched.jd) setTouched(t => ({ ...t, jd: true }));
                setFieldErrors(f => ({ ...f, jd: val.trim() ? undefined : 'Job description is required' }));
                // Clear global only when both valid
                const resumeValid = isChangingResume ? !!file : !!(file || lastResume);
                if (val.trim() && resumeValid) setSubmitError('');
              }}
              placeholder="Paste the job description here...&#10;&#10;Include requirements, responsibilities, and preferred qualifications for the best analysis."
              rows={16}
              className="upload-panel__textarea"
              disabled={isSubmitting}
            />
            <div className="upload-panel__count">
              {touched.jd && fieldErrors.jd && (
                <span className="upload-field-error">{fieldErrors.jd}</span>
              )}
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
            {lastResume && !file && !isChangingResume ? (
              <div className={`upload-transition ${isTransitioning ? 'upload-transition--out' : ''}`}>
                <LastResumeCard
                  fileName={lastResume.fileName}
                  uploadedAt={lastResume.uploadedAt}
                  onReplace={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setIsChangingResume(true);
                      setIsTransitioning(false);
                    }, 150);
                  }}
                />
              </div>
            ) : (
              <div className="upload-transition upload-transition--in">
                {isChangingResume && lastResume && !file && (
                  <p className="upload-replacing-hint">
                    Replacing: {lastResume.fileName}
                    <span> — </span>
                    <button
                      type="button"
                      className="upload-replacing-cancel"
                      onClick={() => {
                        setIsChangingResume(false);
                        setFieldErrors(f => ({ ...f, resume: undefined }));
                        if (jobDescription.trim()) setSubmitError('');
                      }}
                    >
                      Cancel
                    </button>
                  </p>
                )}
                <FileDropzone file={file} onFileSelect={(f) => {
                  setFile(f);
                  setTouched(t => ({ ...t, resume: true }));
                  if (f) {
                    setFieldErrors(fe => ({ ...fe, resume: undefined }));
                    // Clear global only when both valid
                    if (jobDescription.trim()) setSubmitError('');
                  }
                }} />
              </div>
            )}
            {touched.resume && fieldErrors.resume && (
              <p className="upload-field-error" style={{ padding: '0 1rem 0.75rem' }}>{fieldErrors.resume}</p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary upload-submit"
            disabled={isSubmitting}
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
                <span>
                  Analyze Resume
                  {isReusing && lastResume && !isChangingResume && (
                    <span className="upload-submit__hint">Using {lastResume.fileName}</span>
                  )}
                </span>
              </>
            )}
          </button>

          {isSubmitting && (
            <div className="upload-progress animate-in">
              <div className="upload-progress__track">
                <div
                  className="upload-progress__bar"
                  style={{ width: getProgressWidth() }}
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
