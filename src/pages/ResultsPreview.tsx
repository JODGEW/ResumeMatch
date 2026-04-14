import { ProgressRing } from '../components/ProgressRing';
import { Badge } from '../components/Badge';
import { DiffView } from '../components/DiffView';
import { Link } from 'react-router-dom';
import './Results.css';

const MOCK = {
  score: 72,
  fileName: 'john_doe_resume.pdf',
  matchedKeywords: [
    'React', 'TypeScript', 'Node.js', 'REST APIs', 'Git',
    'Agile', 'CI/CD', 'PostgreSQL',
  ],
  missingKeywords: [
    'Kubernetes', 'GraphQL', 'Terraform', 'Data Pipelines', 'Redis',
  ],
  suggestions: [
    {
      text: 'Add experience with container orchestration tools such as Kubernetes or Docker Swarm.',
      section: 'Experience',
      reason: 'The JD explicitly requires Kubernetes experience for managing microservices.',
    },
    {
      text: 'Mention any GraphQL API work, even if it was a side project or migration effort.',
      section: 'Skills',
      reason: 'GraphQL is listed as a required skill alongside REST APIs.',
    },
    {
      text: 'Include infrastructure-as-code experience, particularly with Terraform or CloudFormation.',
      section: 'Experience',
      reason: 'The role involves managing cloud infrastructure and IaC is a core requirement.',
    },
    {
      text: 'Highlight any caching layer experience (Redis, Memcached) in your backend projects.',
      section: 'Projects',
      reason: 'Performance optimization with caching is mentioned in preferred qualifications.',
    },
  ],
  originalText: `John Doe
Software Engineer

Experience:
Senior Software Engineer at Acme Corp (2021-Present)
- Built and maintained React frontend applications serving 50k daily users
- Designed RESTful APIs using Node.js and Express
- Managed PostgreSQL databases and wrote complex queries
- Implemented CI/CD pipelines using GitHub Actions

Skills:
React, TypeScript, Node.js, Express, PostgreSQL, Git, REST APIs, Agile, CI/CD`,
  suggestedText: `John Doe
Software Engineer

Experience:
Senior Software Engineer at Acme Corp (2021-Present)
- Built and maintained React frontend applications serving 50k daily users
- Designed RESTful APIs and GraphQL endpoints using Node.js and Express
- Managed PostgreSQL databases with Redis caching layer and wrote complex queries
- Implemented CI/CD pipelines using GitHub Actions
- Deployed and orchestrated microservices using Kubernetes on AWS EKS
- Managed cloud infrastructure using Terraform for repeatable deployments

Skills:
React, TypeScript, Node.js, Express, PostgreSQL, GraphQL, Redis, Kubernetes, Terraform, Git, REST APIs, Agile, CI/CD`,
};

export function ResultsPreview() {
  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="results-header">
          <div className="results-header__top">
            <div className="results-header__title">
              <h1>Analysis Results</h1>
              <p><span className="results-filename">{MOCK.fileName}</span></p>
            </div>
            <Link to="/upload" className="btn btn-secondary btn-create-action results-header__primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              New analysis
            </Link>
          </div>
        </div>
      </div>

      <div className="results-top">
        <div className="results-score card animate-in stagger-1">
          <ProgressRing score={MOCK.score} />
        </div>

        <div className="results-keywords animate-in stagger-2">
          <div className="card results-keyword-section">
            <h4>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="var(--success)" strokeWidth="1.5" />
                <path d="M5.5 8l2 2 3.5-4" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Matched Keywords
              <span className="results-keyword-count text-success">{MOCK.matchedKeywords.length}</span>
            </h4>
            <div className="results-badges">
              {MOCK.matchedKeywords.map((kw) => (
                <Badge key={kw} label={kw} variant="success" />
              ))}
            </div>
          </div>

          <div className="card results-keyword-section">
            <h4>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="var(--danger)" strokeWidth="1.5" />
                <path d="M6 6l4 4M10 6l-4 4" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Missing Keywords
              <span className="results-keyword-count text-danger">{MOCK.missingKeywords.length}</span>
            </h4>
            <div className="results-badges">
              {MOCK.missingKeywords.map((kw) => (
                <Badge key={kw} label={kw} variant="danger" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="results-section animate-in stagger-3">
        <h2>Suggestions</h2>
        <p className="text-secondary" style={{ marginBottom: '1.25rem' }}>
          Recommended additions to improve your match score
        </p>
        <div className="results-suggestions">
          {MOCK.suggestions.map((s, i) => (
            <div key={i} className="card results-suggestion animate-in" style={{ animationDelay: `${0.3 + i * 0.06}s` }}>
              <div className="results-suggestion__header">
                <span className="results-suggestion__section">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 4h10M2 7h6M2 10h8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {s.section}
                </span>
              </div>
              <p className="results-suggestion__text">{s.text}</p>
              <p className="results-suggestion__reason text-muted">{s.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="results-section animate-in stagger-4">
        <h2>Detailed Changes</h2>
        <p className="text-secondary" style={{ marginBottom: '1.25rem' }}>
          Side-by-side comparison of your resume with suggested improvements
        </p>
        <DiffView original={MOCK.originalText} suggested={MOCK.suggestedText} />
      </div>
    </div>
  );
}
