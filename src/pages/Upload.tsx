import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FileDropzone } from '../components/FileDropzone';
import { LastResumeCard } from '../components/LastResumeCard';
import { requestUploadUrl, requestUploadWithReuse, uploadFileToS3, fetchLastResume } from '../api/upload';
import { extractApiErrorMessage } from '../api/errors';
import { SignupPromptModal } from '../components/SignupPromptModal';
import '../components/LastResumeCard.css';
import './Upload.css';

const DEMO_EMAIL = 'demo123@resumeapp.com';
const STORAGE_KEY = 'resumematch_last_resume';

// Static "What we score" list from the design bundle.
const SCORED = [
  'Technical skills & tools vs. the role',
  'Keyword coverage against the posting',
  'Experience & seniority fit',
  'ATS-friendly resume formatting',
];

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
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
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
  // Reuse path when last resume is the active source (not changing, no new file)
  const isReusing = !file && !!lastResume && !isChangingResume;

  // A resume is selected when a new file is picked, or the saved one is being
  // reused. Same rule the old submit-time check used — the bundle just surfaces
  // it up front by gating the CTA instead of erroring after the click.
  const hasResume = !!file || (!!lastResume && !isChangingResume);
  const hasJobDescription = jobDescription.trim().length > 0;
  const canSubmit = hasJobDescription && hasResume;
  const selectedName = file ? file.name : lastResume?.fileName ?? '';

  const charCount = jobDescription.length;
  const wordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;

  function saveLastResume(analysisId: string, fileName: string) {
    if (isDemo) return;
    const metadata: LastResumeMetadata = { analysisId, fileName, uploadedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    setLastResume(metadata);
  }

  function handleReplaceResume() {
    setIsTransitioning(true);
    setTimeout(() => {
      setFile(null);
      setIsChangingResume(true);
      setIsTransitioning(false);
    }, 150);
  }

  function handleRemoveResume() {
    setFile(null);
    setLastResume(null);
    setIsChangingResume(false);
    localStorage.removeItem(STORAGE_KEY);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting || !canSubmit) return;

    // The shared demo account is read-only. Guarding above requestUploadUrl
    // means the picked file never leaves the browser: no presigned POST, no S3
    // object, no DynamoDB row on the shared account.
    if (isDemo) {
      setShowSignupPrompt(true);
      return;
    }

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
      const axiosErr = err as { response?: { status?: number } };
      const status = axiosErr?.response?.status;

      // If reuse fails with 404, the original resume is gone — clear and fall back to dropzone
      if (isReusing && status === 404) {
        localStorage.removeItem(STORAGE_KEY);
        setLastResume(null);
        setIsChangingResume(false);
        setError('Previous resume is no longer available. Please upload again.');
      } else {
        setError(extractApiErrorMessage(err, 'Upload failed. Please try again.'));
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

  const ctaTitle = isSubmitting
    ? STAGE_LABELS[stage]
    : canSubmit
      ? 'Analyze Resume'
      : !hasJobDescription
        ? 'Add a job description to continue'
        : 'Upload a resume to continue';

  const ctaSub = canSubmit
    ? `Scoring ${selectedName} against this posting`
    : !hasResume
      ? 'Upload a resume to enable analysis'
      : 'Paste the job description above to enable analysis';

  return (
    <div className="page-container upload-page">
      <div className="upload-head animate-in">
        <h1>New Analysis</h1>
        <p>Paste a job description and pick your resume — we'll score the match in seconds.</p>
      </div>

      {error && (
        <div className="upload-alert animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>
            {error}
            {isChangingResume && lastResume && (
              <button
                type="button"
                className="upload-alert__revert"
                onClick={() => {
                  setIsChangingResume(false);
                  setFile(null);
                  setError('');
                }}
              >
                Keep {lastResume.fileName}
              </button>
            )}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="upload-grid">
          {/* Left column — JD */}
          <section className="upload-panel animate-in stagger-1">
            <div className="upload-panel__head">
              <span className="upload-panel__step">1</span>
              <div className="upload-panel__heading">
                <div className="upload-panel__title">Job Description</div>
                <div className="upload-panel__sub">Paste the text straight from the posting</div>
              </div>
            </div>

            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here — include requirements, responsibilities, and preferred qualifications for the sharpest match."
              className="upload-textarea"
              disabled={isSubmitting}
            />

            <div className="upload-textarea__foot">
              <span className="upload-count">
                {charCount
                  ? `${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} characters`
                  : 'Waiting for a job description…'}
              </span>
              <button
                type="button"
                className={`upload-clear ${charCount ? '' : 'upload-clear--hidden'}`}
                onClick={() => setJobDescription('')}
                disabled={isSubmitting}
              >
                Clear
              </button>
            </div>
          </section>

          {/* Right column — Resume */}
          <section className="upload-panel animate-in stagger-2">
            <div className="upload-panel__head">
              <span className="upload-panel__step">2</span>
              <div className="upload-panel__heading">
                <div className="upload-panel__title">Resume</div>
                <div className="upload-panel__sub">Choose which version to score</div>
              </div>
            </div>

            {hasResume ? (
              <div className={`upload-transition ${isTransitioning ? 'upload-transition--out' : ''}`}>
                <LastResumeCard
                  fileName={selectedName}
                  uploadedAt={file ? undefined : lastResume?.uploadedAt}
                  sizeBytes={file ? file.size : undefined}
                  onReplace={handleReplaceResume}
                  onRemove={handleRemoveResume}
                />
              </div>
            ) : (
              <div className="upload-transition upload-transition--in">
                {isChangingResume && lastResume && (
                  <p className="upload-replacing">
                    Replacing: <span className="upload-replacing__name">{lastResume.fileName}</span>
                    <button
                      type="button"
                      className="upload-replacing__cancel"
                      onClick={() => setIsChangingResume(false)}
                    >
                      — Cancel
                    </button>
                  </p>
                )}
                <FileDropzone onFileSelect={setFile} />
              </div>
            )}

            <div className="upload-scored">
              <div className="upload-scored__label">What we score</div>
              <div className="upload-scored__list">
                {SCORED.map((item) => (
                  <div key={item} className="upload-scored__item">
                    <span className="upload-scored__check">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline
                          points="2,6.5 4.7,9 10,3"
                          stroke="var(--success-alt)"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <p className="upload-privacy">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 7.2v3.4M8 5.2v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>Nothing is saved to job boards. Your resume is only used to compute the match.</span>
            </p>
          </section>
        </div>

        <button
          type="submit"
          className={`upload-cta ${canSubmit ? 'upload-cta--ready' : ''}`}
          disabled={!canSubmit || isSubmitting}
        >
          <span className="upload-cta__text">
            <span className="upload-cta__title">{ctaTitle}</span>
            <span className="upload-cta__sub">{ctaSub}</span>
          </span>
          <span className="upload-cta__icon">
            {isSubmitting ? (
              <span className="loading-spinner loading-spinner--sm" />
            ) : (
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h9M8.5 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>

        {isSubmitting && (
          <div className="upload-progress animate-in">
            <div className="upload-progress__track">
              <div className="upload-progress__bar" style={{ width: getProgressWidth() }} />
            </div>
          </div>
        )}
      </form>

      {showSignupPrompt && (
        <SignupPromptModal
          onClose={() => setShowSignupPrompt(false)}
          title="Run Your Own Analysis"
          body="Create a free account to match your resume against any job description — free, no card."
        />
      )}
    </div>
  );
}
