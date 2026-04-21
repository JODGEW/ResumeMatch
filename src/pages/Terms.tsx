import { LegalLayout } from '../components/LegalLayout';
import { siteConfig } from '../config/site';

export function Terms() {
  return (
    <LegalLayout
      eyebrow="Terms"
      title="Terms of Use"
      intro="Simple terms for using ResumeMatch responsibly."
    >
      <section>
        <h2>Using ResumeMatch</h2>
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
      </section>

      <section>
        <h2>Accounts and access</h2>
        <p>
          You must provide accurate account information and keep it up to date. You may not access the
          service through unauthorized means, interfere with normal operation, attempt to reverse engineer
          protected systems, or use the service to violate another person&apos;s rights.
        </p>
      </section>

      <section>
        <h2>Your uploads and content</h2>
        <p>
          You retain ownership of the resumes, job descriptions, interview responses, and other material
          you submit. You grant ResumeMatch permission to host, process, store, and display that content
          as needed to operate the service for you.
        </p>
        <p>
          You are responsible for making sure you have the right to upload and use the content you submit.
        </p>
      </section>

      <section>
        <h2>AI-generated output</h2>
        <p>
          ResumeMatch uses AI to generate resume analysis, targeted suggestions, interview questions, and
          interview feedback. These outputs are not guaranteed to be correct, complete, or appropriate for
          your circumstances.
        </p>
        <p>
          You should review all results before using them in job applications, interviews, or other decisions.
        </p>
      </section>

      <section>
        <h2>Beta and availability</h2>
        <p>
          ResumeMatch may still include beta features. We may change, suspend, or remove features at any
          time, including limits, availability, and access rules, especially while the product is evolving.
        </p>
      </section>

      <section>
        <h2>Plans and billing</h2>
        <p>
          ResumeMatch is currently available free during beta. If paid plans or subscriptions are introduced,
          additional pricing, billing, cancellation, and refund terms may apply at checkout or in plan-specific policies.
        </p>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          We may suspend or terminate access if you violate these terms, create risk for the service or other
          users, or misuse the platform. You may stop using the service at any time.
        </p>
      </section>

      <section>
        <h2>Disclaimers and limits</h2>
        <p>
          ResumeMatch is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law,
          we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted service.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms from time to time. Continued use of ResumeMatch after an update means
          the revised terms apply to your ongoing use.
        </p>
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
