export interface Application {
  id: string;
  companyName: string;
  roleTitle: string;
  jobPostingUrl?: string;
  dateApplied: string;
  resumeVersion: 'fullstack' | 'frontend' | 'cloud_devops' | 'custom';

  skillMatch: {
    matchedSkills: string[];
    missingSkills: string[];
    matchPercentage: number;
  };

  applicationStatus: 'not_applied' | 'applied' | 'screening' | 'interviewing' | 'offer' | 'rejected';
  statusChangedAt?: string;

  outreachWorth: boolean;
  outreachOverride?: boolean;

  companySize: 'startup' | 'midsize' | 'enterprise';
  postingAgeWeeks?: number;
  seniorityFit?: 'entry' | 'mid' | 'senior';

  contact?: {
    name: string;
    role: string;
    email?: string;
    linkedinUrl?: string;
    source: string;
  };

  outreachStatus:
    | 'not_started'
    | 'researching'
    | 'drafted'
    | 'sent'
    | 'followed_up'
    | 'replied'
    | 'no_response'
    | 'skipped';

  outreachDate?: string;
  followUpDate?: string;
  followUpSent?: boolean;

  response?: {
    date: string;
    type: 'positive' | 'negative' | 'referral' | 'no_response';
    notes: string;
    nextStep?: string;
  };

  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function calculateOutreachScore(app: Application): { score: number; worth: boolean; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Skill Match (max 35)
  const match = app.skillMatch.matchPercentage;
  if (match >= 80) {
    score += 35;
    reasons.push(`Skill match ${match}% (≥80%): +35`);
  } else if (match >= 60) {
    score += 25;
    reasons.push(`Skill match ${match}% (60-79%): +25`);
  } else if (match >= 40) {
    score += 10;
    reasons.push(`Skill match ${match}% (40-59%): +10`);
  } else {
    reasons.push(`Skill match ${match}% (<40%): +0`);
  }

  // Company Size (max 25)
  if (app.companySize === 'startup') {
    score += 25;
    reasons.push('Startup: +25');
  } else if (app.companySize === 'midsize') {
    score += 10;
    reasons.push('Midsize: +10');
  } else {
    reasons.push('Enterprise: +0');
  }

  // Contact Email (max 20)
  if (app.contact?.email) {
    score += 20;
    reasons.push('Has contact email: +20');
  } else {
    reasons.push('No contact email: +0');
  }

  // Posting Age (max 15) — fresh postings score highest
  if (app.postingAgeWeeks === 0) {
    score += 15;
    reasons.push('Posted < 1 week: +15');
  } else if (app.postingAgeWeeks != null && app.postingAgeWeeks >= 1 && app.postingAgeWeeks < 2) {
    score += 10;
    reasons.push('Posted 1-2 weeks: +10');
  } else if (app.postingAgeWeeks != null && app.postingAgeWeeks >= 2) {
    reasons.push('Posted 2+ weeks: +0');
  } else {
    score += 5;
    reasons.push('Posting age unknown: +5');
  }

  // Seniority Fit (max 5)
  if (app.seniorityFit === 'entry') {
    score += 5;
    reasons.push('Entry/Junior level: +5');
  } else if (app.seniorityFit === 'mid') {
    score += 3;
    reasons.push('Mid level: +3');
  } else if (app.seniorityFit === 'senior') {
    reasons.push('Senior level: +0');
  } else {
    score += 3;
    reasons.push('Seniority unknown: +3');
  }

  return {
    score,
    worth: score >= 60,
    reasons
  };
}

export const SAMPLE_DATA: Application[] = [
  {
    id: 'demo-1',
    companyName: 'Acme AI',
    roleTitle: 'Full-Stack Engineer',
    dateApplied: '2026-02-20',
    resumeVersion: 'fullstack',
    applicationStatus: 'interviewing',
    skillMatch: {
      matchedSkills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Python'],
      missingSkills: ['Go'],
      matchPercentage: 88
    },
    companySize: 'startup',
    postingAgeWeeks: 3,
    seniorityFit: 'mid',
    outreachWorth: true,
    contact: {
      name: 'Sarah Chen',
      role: 'Engineering Manager',
      email: 'sarah@acmeai.com',
      linkedinUrl: 'https://linkedin.com/in/sarahchen',
      source: 'Hunter.io'
    },
    outreachStatus: 'replied',
    outreachDate: '2026-02-22',
    followUpDate: '2026-03-01',
    followUpSent: false,
    response: {
      date: '2026-02-25',
      type: 'positive',
      notes: 'Interested in chatting. Scheduled phone screen.',
      nextStep: 'Phone screen 3/3 at 2pm EST'
    },
    notes: 'Found via Wellfound. Team is building AI document tools — ResumeMatch is directly relevant.',
    createdAt: '2026-02-20T10:00:00Z',
    updatedAt: '2026-02-25T14:00:00Z'
  },
  {
    id: 'demo-2',
    companyName: 'CloudScale Inc',
    roleTitle: 'Cloud Engineer',
    dateApplied: '2026-02-18',
    resumeVersion: 'cloud_devops',
    applicationStatus: 'applied',
    skillMatch: {
      matchedSkills: ['AWS', 'Terraform', 'Docker', 'CI/CD', 'Python'],
      missingSkills: ['Kubernetes production experience', 'Datadog'],
      matchPercentage: 75
    },
    companySize: 'midsize',
    postingAgeWeeks: 2,
    seniorityFit: 'mid',
    outreachWorth: true,
    contact: {
      name: 'Mike Rodriguez',
      role: 'DevOps Lead',
      email: 'mike.r@cloudscale.io',
      source: 'Apollo.io'
    },
    outreachStatus: 'sent',
    outreachDate: '2026-02-24',
    followUpDate: '2026-03-03',
    followUpSent: false,
    notes: 'Series B company, 150 people. AWS-heavy stack matches well.',
    createdAt: '2026-02-18T09:00:00Z',
    updatedAt: '2026-02-24T11:00:00Z'
  },
  {
    id: 'demo-3',
    companyName: 'PixelForge',
    roleTitle: 'Frontend Engineer',
    dateApplied: '2026-02-25',
    resumeVersion: 'frontend',
    applicationStatus: 'applied',
    skillMatch: {
      matchedSkills: ['React', 'TypeScript', 'Next.js', 'Tailwind'],
      missingSkills: ['Vue.js', 'Storybook'],
      matchPercentage: 72
    },
    companySize: 'startup',
    postingAgeWeeks: 1,
    seniorityFit: 'entry',
    outreachWorth: true,
    contact: {
      name: 'Lisa Park',
      role: 'CTO',
      linkedinUrl: 'https://linkedin.com/in/lisapark',
      source: 'Company website'
    },
    outreachStatus: 'researching',
    notes: 'Small team (20 people). Building design tools. CTO posts on LinkedIn regularly — engage first.',
    createdAt: '2026-02-25T08:00:00Z',
    updatedAt: '2026-02-25T08:00:00Z'
  },
  {
    id: 'demo-4',
    companyName: 'MegaCorp Financial',
    roleTitle: 'Software Engineer II',
    dateApplied: '2026-02-15',
    resumeVersion: 'fullstack',
    applicationStatus: 'rejected',
    skillMatch: {
      matchedSkills: ['JavaScript', 'REST APIs', 'SQL'],
      missingSkills: ['Java', 'Spring Boot', 'Oracle', 'Kafka'],
      matchPercentage: 35
    },
    companySize: 'enterprise',
    postingAgeWeeks: 1,
    seniorityFit: 'mid',
    outreachWorth: false,
    outreachStatus: 'skipped',
    notes: 'Low skill match + enterprise = not worth outreach. Let the application run its course.',
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-02-15T10:00:00Z'
  },
  {
    id: 'demo-5',
    companyName: 'NovaBuild',
    roleTitle: 'Full-Stack Developer',
    dateApplied: '2026-02-10',
    resumeVersion: 'fullstack',
    applicationStatus: 'rejected',
    skillMatch: {
      matchedSkills: ['React', 'Node.js', 'PostgreSQL', 'AWS', 'TypeScript', 'Docker'],
      missingSkills: ['Redis'],
      matchPercentage: 90
    },
    companySize: 'startup',
    postingAgeWeeks: 4,
    seniorityFit: 'entry',
    outreachWorth: true,
    contact: {
      name: 'James Wu',
      role: 'Head of Engineering',
      email: 'james@novabuild.dev',
      linkedinUrl: 'https://linkedin.com/in/jameswu',
      source: 'Hunter.io'
    },
    outreachStatus: 'followed_up',
    outreachDate: '2026-02-12',
    followUpDate: '2026-02-19',
    followUpSent: true,
    response: {
      date: '2026-02-26',
      type: 'no_response',
      notes: 'No reply after follow-up. Moving on.'
    },
    notes: 'Great match but no response. Posted for 4 weeks — role might be filled or on hold.',
    createdAt: '2026-02-10T09:00:00Z',
    updatedAt: '2026-02-26T09:00:00Z'
  },
  {
    id: 'demo-6',
    companyName: 'DataFlow Labs',
    roleTitle: 'Backend Engineer',
    dateApplied: '2026-03-01',
    resumeVersion: 'fullstack',
    applicationStatus: 'screening',
    skillMatch: {
      matchedSkills: ['Python', 'AWS Lambda', 'DynamoDB', 'REST APIs', 'Docker'],
      missingSkills: ['Golang', 'gRPC'],
      matchPercentage: 78
    },
    companySize: 'startup',
    postingAgeWeeks: 2,
    seniorityFit: 'entry',
    outreachWorth: true,
    outreachStatus: 'drafted',
    contact: {
      name: 'Ana Petrova',
      role: 'Engineering Manager',
      email: 'ana@dataflowlabs.io',
      source: 'Apollo.io'
    },
    notes: 'Data pipeline company. My ResumeMatch AI pipeline experience is a strong talking point.',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-02T14:00:00Z'
  }
];
