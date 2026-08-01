import { Link } from 'react-router-dom';
import { LegalLayout } from '../components/LegalLayout';
import type { LegalTocItem } from '../components/LegalLayout';
import { LegalSection } from '../components/LegalSection';
import { siteConfig } from '../config/site';

const TOC: LegalTocItem[] = [
  { id: 's1', label: 'Using ResumeMatch' },
  { id: 's2', label: 'Accounts and access' },
  { id: 's3', label: 'Your uploads and content' },
  { id: 's4', label: 'AI-generated output' },
  { id: 's5', label: 'Beta and availability' },
  { id: 's6', label: 'Plans and billing' },
  { id: 's7', label: 'Termination' },
  { id: 's8', label: 'Disclaimers and limits' },
  { id: 's9', label: 'Changes and contact' },
];

const CHIPS = ['Free during beta', 'You own your uploads', 'Review AI output before use'];

export function Terms() {
  return (
    <LegalLayout
      eyebrow="Terms"
      title="Terms of Use"
      intro="Simple terms for using ResumeMatch responsibly."
      chips={CHIPS}
      toc={TOC}
    >
      <LegalSection id="s1" num="01" title="Using ResumeMatch">
        <p>
          You may use ResumeMatch only in compliance with applicable law and these terms. You are
          responsible for the activity that happens under your account and for keeping your login
          credentials secure.
        </p>
        <p>You may not:</p>
        <ul>
          <li><strong>No unauthorized uploads</strong>: upload content you do not have the right to use or share.</li>
          <li><strong>No service abuse</strong>: attempt to overload, scrape, abuse, or disrupt the service.</li>
          <li><strong>No circumvention</strong>: bypass product limits, access controls, or account protections.</li>
        </ul>
      </LegalSection>

      <LegalSection id="s2" num="02" title="Accounts and access">
        <p>
          You must provide accurate account information and keep it up to date. You may not access the
          service through unauthorized means, interfere with normal operation, attempt to reverse engineer
          protected systems, or use the service to violate another person&apos;s rights.
        </p>
      </LegalSection>

      <LegalSection id="s3" num="03" title="Your uploads and content">
        <p>
          You retain ownership of the resumes, job descriptions, interview responses, and other material
          you submit. You grant ResumeMatch permission to host, process, store, and display that content
          as needed to operate the service for you.
        </p>
        <p>
          You are responsible for making sure you have the right to upload and use the content you submit.
        </p>
        <p>
          How your content is stored and what is never stored (including interview audio) is
          described in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="s4" num="04" title="AI-generated output">
        <p>
          ResumeMatch uses AI to generate resume analysis, targeted suggestions, interview questions, and
          interview feedback. These outputs are not guaranteed to be correct, complete, or appropriate for
          your circumstances.
        </p>
        <p>
          You should review all results before using them in job applications, interviews, or other decisions.
        </p>
      </LegalSection>

      <LegalSection id="s5" num="05" title="Beta and availability">
        <p>
          ResumeMatch may still include beta features. We may change, suspend, or remove features at any
          time, including limits, availability, and access rules, especially while the product is evolving.
        </p>
      </LegalSection>

      <LegalSection id="s6" num="06" title="Plans and billing">
        <p>
          ResumeMatch is currently available free during beta. If paid plans or subscriptions are introduced,
          additional pricing, billing, cancellation, and refund terms may apply at checkout or in plan-specific policies.
        </p>
      </LegalSection>

      <LegalSection id="s7" num="07" title="Termination">
        <p>
          We may suspend or terminate access if you violate these terms, create risk for the service or other
          users, or misuse the platform. You may stop using the service at any time.
        </p>
      </LegalSection>

      <LegalSection id="s8" num="08" title="Disclaimers and limits">
        <p>
          ResumeMatch is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law,
          we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted service.
        </p>
      </LegalSection>

      <LegalSection id="s9" num="09" title="Changes and contact">
        <p>
          We may update these terms from time to time. Continued use of ResumeMatch after an update means
          the revised terms apply to your ongoing use.
        </p>
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
