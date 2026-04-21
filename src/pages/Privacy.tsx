import { LegalLayout } from '../components/LegalLayout';
import { siteConfig } from '../config/site';

export function Privacy() {
  return (
    <LegalLayout
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="How ResumeMatch collects, uses, stores, and protects your data."
    >
      <section className="legal-summary">
        <h2>Summary</h2>
        <ul>
          <li><strong>We do not sell your data</strong>: we do not sell your personal information or resume content.</li>
          <li><strong>No model training</strong>: we do not use your submitted content to train ResumeMatch models.</li>
          <li><strong>No other-user access</strong>: your data is not visible to other users through the product.</li>
          <li><strong>Account-linked data</strong>: your saved content is tied to your account and is not exposed to other users through the product.</li>
          <li><strong>Product use only</strong>: your resume, job description, and interview input are used to generate your analysis and interview workflow.</li>
          <li><strong>Deletion requests</strong>: you can request deletion by contacting support.</li>
        </ul>
      </section>

      <section className="legal-section--major">
        <h2>Information we collect</h2>
        <p>We collect information you provide directly through the product.</p>
        <ul>
          <li><strong>Account data</strong>: name, email address, login, and password recovery details.</li>
          <li><strong>Resume and role data</strong>: uploaded resume files, job descriptions, analysis results, and exportable resume documents.</li>
          <li><strong>Interview data</strong>: interview responses, transcripts, scores, and feedback history.</li>
          <li><strong>Application tracking data</strong>: saved application activity, contacts, notes, and workflow state.</li>
          <li><strong>Usage and diagnostic data</strong>: feature usage, device or browser details, logs, and reliability diagnostics.</li>
        </ul>
      </section>

      <section className="legal-section--major">
        <h2>How we use information</h2>
        <p>We use your data to run the product you signed up for.</p>
        <ul>
          <li><strong>Resume analysis</strong>: analyze your resume against job descriptions.</li>
          <li><strong>Role-specific output</strong>: generate suggestions, interview questions, and interview feedback.</li>
          <li><strong>Saved history</strong>: keep analysis history, interview history, and resume reuse state so you can come back to prior work.</li>
          <li><strong>Account security</strong>: authenticate accounts, maintain session security, and prevent abuse.</li>
          <li><strong>Support and reliability</strong>: investigate bugs and service failures, and respond to support requests.</li>
          <li><strong>Operations</strong>: support billing, compliance, and product operations as paid plans are introduced.</li>
        </ul>
      </section>

      <section className="legal-section--major">
        <h2>How your data is handled</h2>
        <ul>
          <li><strong>Stored with your account</strong>: your resume file and saved results may be stored so you can reuse your resume and revisit analysis or interview history.</li>
          <li><strong>No internal training</strong>: ResumeMatch does not use your submitted content to train its own models.</li>
          <li><strong>AWS Bedrock processing</strong>: we use AWS Bedrock for AI processing. AWS states it does not use your data to train models or retain prompts.</li>
        </ul>
      </section>

      <section>
        <h2>How information is shared</h2>
        <p>
          We do not sell your personal information. We may share data with service providers
          that help us run ResumeMatch, including cloud hosting, authentication, storage, OCR,
          analytics, and AI inference services, and only to the extent needed to operate the service.
        </p>
        <p>
          We may also disclose information when required by law, to protect users, or to investigate fraud,
          misuse, or security incidents.
        </p>
      </section>

      <section className="legal-section--major">
        <h2>Retention and control</h2>
        <p>We may store the following while your account is active:</p>
        <ul>
          <li><strong>Uploaded resumes</strong>: resume files you submit for analysis.</li>
          <li><strong>Saved analyses</strong>: result history tied to your account.</li>
          <li><strong>Interview records</strong>: transcripts, scores, and feedback history.</li>
          <li><strong>Saved workflow data</strong>: resume reuse state and application-tracking data.</li>
        </ul>
        <p>
          We keep account and product data for as long as needed to operate ResumeMatch, comply with legal
          obligations, resolve disputes, and enforce our terms.
        </p>
        <p>
          You can contact us to request account or data deletion, subject to any records we must retain for
          security, billing, or legal reasons.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use industry-standard cloud infrastructure, access controls, and operational monitoring intended
          to protect account and application data. No internet service or storage system is completely secure,
          so we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update this policy from time to time. When we make material changes, we will update the
          date at the top of this page.
        </p>
        <p>
          Questions about this policy can be sent to{' '}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
