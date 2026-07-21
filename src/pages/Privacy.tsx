import { LegalLayout } from '../components/LegalLayout';
import type { LegalTocItem } from '../components/LegalLayout';
import { LegalSection } from '../components/LegalSection';
import { siteConfig } from '../config/site';

const TOC: LegalTocItem[] = [
  { id: 's1', label: 'What we store' },
  { id: 's2', label: 'What we do not store' },
  { id: 's3', label: 'Training' },
  { id: 's4', label: 'Deletion' },
  { id: 's5', label: 'System logs' },
  { id: 's6', label: 'Sub-processors' },
  { id: 's7', label: 'Contact' },
];

const CHIPS = ['No interview audio stored', 'No model training on your data', 'Delete your data anytime'];

export function Privacy() {
  return (
    <LegalLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="How ResumeMatch collects, uses, stores, and protects your data."
      chips={CHIPS}
      toc={TOC}
      lastUpdated="July 20, 2026"
    >
      <LegalSection id="s1" num="01" title="What we store">
        <p>When you use ResumeMatch we store, privately in your account:</p>
        <ul>
          <li>the resume file you upload (the PDF itself) and the text extracted from it;</li>
          <li>the job descriptions you paste;</li>
          <li>your analysis results (match scores, keyword lists, suggested edits);</li>
          <li>your mock-interview transcripts (the text of your answers and our feedback).</li>
        </ul>
      </LegalSection>

      <LegalSection id="s2" num="02" title="What we do not store">
        <p>
          We do not store interview <strong>audio</strong>. When you speak an answer, the audio
          streams from your browser directly to our speech-to-text provider,{' '}
          <strong>Deepgram</strong>, which transcribes it. The audio never reaches our servers; only
          the resulting text transcript is saved to your account. We opt out of Deepgram&apos;s
          model-improvement program on every request, and per Deepgram&apos;s policy, opted-out
          audio is retained only long enough to process the request.
        </p>
      </LegalSection>

      <LegalSection id="s3" num="03" title="Training">
        <p>
          Nothing you upload is used to train AI models. Analyses run on{' '}
          <strong>Amazon Bedrock</strong>, which does not use customer inputs to train its models
          (per AWS policy). We do not train any model on your data, and we never sell your data.
        </p>
      </LegalSection>

      <LegalSection id="s4" num="04" title="Deletion">
        <p>
          Email <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> and we
          will delete your account and all associated data within <strong>7 days</strong>.
          Self-serve deletion from within the app is coming.
        </p>
      </LegalSection>

      <LegalSection id="s5" num="05" title="System logs">
        <p>
          Operational logs may contain fragments derived from your resume (for example extracted
          keywords). These logs expire automatically within <strong>90 days</strong>.
        </p>
      </LegalSection>

      <LegalSection id="s6" num="06" title="Sub-processors">
        <ul className="legal-list--loose">
          <li>
            <strong>Amazon Web Services</strong> — hosting, storage, and AI analysis. Receives
            everything you upload.
          </li>
          <li>
            <strong>Deepgram</strong> — speech-to-text for mock interviews. Receives your interview
            audio; returns text. All requests are sent with Deepgram&apos;s model-improvement
            opt-out.
          </li>
          <li>
            <strong>Hunter.io</strong> — used only in the outreach feature, to look up publicly
            listed contact information for a company you are researching. It receives only that
            company&apos;s domain name. It never receives your resume, your job descriptions, or
            your identity.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="s7" num="07" title="Contact">
        <p>
          Questions about this policy can be sent to{' '}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
