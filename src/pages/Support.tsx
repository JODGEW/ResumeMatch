import { Link } from 'react-router-dom';
import { LegalLayout } from '../components/LegalLayout';
import type { LegalTocItem } from '../components/LegalLayout';
import { LegalSection } from '../components/LegalSection';
import { siteConfig } from '../config/site';
import './Support.css';

const TOC: LegalTocItem[] = [
  { id: 's1', label: 'Contact us' },
  { id: 's2', label: 'Account and sign-in' },
  { id: 's3', label: 'Analyses and limits' },
  { id: 's4', label: 'Mock interviews' },
  { id: 's5', label: 'Your data' },
];

const CHIPS = ['Free during beta', 'No interview audio stored', 'Delete your data anytime'];

export function Support() {
  return (
    <LegalLayout
      eyebrow="Support"
      title="How can we help?"
      intro="Common questions about accounts, analyses, and your data — and one email address for everything else."
      chips={CHIPS}
      toc={TOC}
      lastUpdated={null}
    >
      <LegalSection id="s1" num="01" title="Contact us">
        <div className="support-contact">
          <div>
            <div className="support-contact__label">Email support</div>
            <a className="support-contact__address" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            <p className="support-contact__note">
              One inbox for everything: bugs, account access, and data-deletion requests. Include the
              email you signed up with so we can find your account.
            </p>
          </div>
          <a className="legal-btn legal-btn--primary" href={`mailto:${siteConfig.supportEmail}`}>
            Write to us
          </a>
        </div>
      </LegalSection>

      <LegalSection id="s2" num="02" title="Account and sign-in">
        <div className="support-qa">
          <div className="support-qa__item">
            <h3>I forgot my password</h3>
            <p>
              Use <strong>Forgot password?</strong> on the sign-in page. We email a 6-digit code;
              enter it to set a new password.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>I didn&apos;t get my verification code</h3>
            <p>
              Check spam first — codes come from AWS Cognito. Then use <strong>Resend code</strong>{' '}
              on the verification screen to request a new one.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>Can I try it without an account?</h3>
            <p>
              Yes. The sign-in page offers to <strong>open the demo workspace</strong> — a shared,
              read-only account that needs no signup. Create an account when you want a private one.
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection id="s3" num="03" title="Analyses and limits">
        <div className="support-qa">
          <div className="support-qa__item">
            <h3>What are the daily limits?</h3>
            <p>
              During beta: <strong>10 resume analyses</strong> and{' '}
              <strong>5 mock interview sessions</strong> per day, per account. Limits reset daily.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>Which file types can I upload?</h3>
            <p>
              PDF resumes, up to <strong>5 MB</strong>. Returning users can reuse their last uploaded
              resume against a new job description without re-uploading it.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>My analysis is stuck or failed</h3>
            <p>
              Most analyses finish in about 30 seconds. The results page keeps checking for two
              minutes and then tells you it can no longer see the status — a report that does finish
              still saves to your History. If nothing appears there, run the analysis again; if it
              happens twice, email us with the role title and rough time.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>How is the match score calculated?</h3>
            <p>
              Five tiers, from <strong>Poor Match</strong> (0–40) through Weak (41–60), Moderate
              (61–75) and Good (76–85) to <strong>Strong Match</strong> (86–100). The score weighs
              technical skills, tools, soft skills, and experience against the posting, and the
              results page breaks out each of those four.
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection id="s4" num="04" title="Mock interviews">
        <div className="support-qa">
          <div className="support-qa__item">
            <h3>The microphone isn&apos;t working</h3>
            <p>
              Allow microphone access when the browser asks, then press and hold the mic button — or
              hold the Space key — to answer. A wired or built-in mic transcribes more accurately
              than a Bluetooth headset, and the app warns you before you start if it detects one.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>Can I pause and come back?</h3>
            <p>
              Yes. An active session is restored when you return to the interview page, and completed
              sessions open into their report from <strong>Interviews</strong>.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>Is my voice recorded?</h3>
            <p>
              No. Audio streams from your browser to Deepgram for transcription and never reaches our
              servers; only the text transcript is saved. Details in the{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </LegalSection>

      <LegalSection id="s5" num="05" title="Your data">
        <div className="support-qa">
          <div className="support-qa__item">
            <h3>Delete my account and data</h3>
            <p>
              Email <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
              Everything — resume files and text, job descriptions, analyses, interview transcripts,
              and tracker entries — is deleted within <strong>7 days</strong>. System logs are the one
              exception; they expire automatically within <strong>90 days</strong>. Self-serve
              deletion from within the app is coming.
            </p>
          </div>
          <div className="support-qa__item">
            <h3>Is my resume used to train AI?</h3>
            <p>
              No. Analyses run on <strong>Amazon Bedrock</strong>, which does not use customer inputs
              to train its models, and we never sell your data.
            </p>
          </div>
        </div>
      </LegalSection>
    </LegalLayout>
  );
}
