/**
 * DownloadOptimizedButton.tsx
 *
 * Renders a download button for the optimized resume DOCX.
 * Only visible when:
 *   - Analysis status === 'completed'
 *   - suggestedText is present and non-empty
 *
 * Props:
 *   - suggestedText: string from the analysis result
 *   - status: analysis status string
 *   - className?: optional CSS class for positioning
 */

import React, { useState, useCallback } from 'react';
import { parseResume } from '../utils/resumeParser';
import { downloadOptimizedResume } from '../utils/docxGenerator';
import { SignupPromptModal } from './SignupPromptModal';
import './DownloadOptimizedButton.css';

interface DownloadOptimizedButtonProps {
  suggestedText?: string;
  status: string;
  isDemo?: boolean;
  className?: string;
}

const DownloadOptimizedButton: React.FC<DownloadOptimizedButtonProps> = ({
  suggestedText,
  status,
  isDemo,
  className,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignupModal, setShowSignupModal] = useState(false);

  const handleDownload = useCallback(async () => {
    if (isGenerating) return;

    if (isDemo) {
      setShowSignupModal(true);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      if (!suggestedText) return;
      const parsed = parseResume(suggestedText);
      await downloadOptimizedResume(parsed);
    } catch (err) {
      console.error('DOCX generation failed:', err);
      setError('Failed to generate document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [suggestedText, isGenerating, isDemo]);

  // Gate: only show when analysis is done and we have text
  if (status !== 'completed' || !suggestedText?.trim()) {
    return null;
  }

  return (
    <div className={`download-optimized ${className ?? ''}`.trim()}>
      <button
        className="btn btn-primary download-optimized__button"
        onClick={handleDownload}
        disabled={isGenerating}
        title={isDemo ? 'Sign up for full access' : undefined}
      >
        {isGenerating ? (
          <>
            <LoadingSpinner />
            Generating...
          </>
        ) : (
          <>
            <DownloadIcon />
            Download ATS-Optimized Resume (DOCX)
          </>
        )}
      </button>

      <p className="download-optimized__hint">
        Optimized for ATS parsing — paste into your preferred template
      </p>

      {error && (
        <p className="download-optimized__error">
          {error}
        </p>
      )}

      {showSignupModal && (
        <SignupPromptModal
          onClose={() => setShowSignupModal(false)}
          title="Download Your Optimized Resume"
          body="Create a free account to download your AI-optimized resume as a Word document."
        />
      )}
    </div>
  );
};

/** Simple SVG download icon */
const DownloadIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 2v8m0 0L5 7m3 3l3-3" />
    <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
  </svg>
);

/** Simple CSS spinner */
const LoadingSpinner: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    style={{ animation: 'spin 0.8s linear infinite' }}
  >
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="28"
      strokeDashoffset="8"
      strokeLinecap="round"
    />
  </svg>
);

export default DownloadOptimizedButton;
