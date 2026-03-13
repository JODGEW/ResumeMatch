# Outreach Tracker — Feature Spec for ResumeMatch

## Overview

Add a **Job Outreach Tracker** to ResumeMatch that helps you decide which applications are worth cold outreach, track contacts, manage follow-ups, and log responses. This lives alongside the existing resume analysis feature as a new tab/page.

---

## Data Model

### Application Entry

```typescript
interface Application {
  id: string;                    // UUID
  companyName: string;
  roleTitle: string;
  jobPostingUrl?: string;
  dateApplied: string;           // ISO date
  resumeVersion: 'fullstack' | 'frontend' | 'cloud_devops' | 'custom';
  
  // Skill Match Scoring
  skillMatch: {
    matchedSkills: string[];     // e.g. ["React", "TypeScript", "AWS"]
    missingSkills: string[];     // e.g. ["Go", "Kubernetes"]
    matchPercentage: number;     // 0-100, auto-calculated
  };
  
  // Outreach Decision
  outreachWorth: boolean;        // auto-suggested based on scoring rules
  outreachOverride?: boolean;    // manual override
  
  // Company Info
  companySize: 'startup' | 'midsize' | 'enterprise';
  postingAgeWeeks?: number;      // how long the job has been posted
  
  // Contact Info
  contact?: {
    name: string;
    role: string;                // e.g. "Engineering Manager"
    email?: string;
    linkedinUrl?: string;
    source: string;              // e.g. "Hunter.io", "Company website", "LinkedIn"
  };
  
  // Outreach Status Tracking
  outreachStatus: 
    | 'not_started'
    | 'researching'              // finding contact info
    | 'drafted'                  // message written
    | 'sent'                     // initial outreach sent
    | 'followed_up'              // follow-up sent
    | 'replied'                  // got a response
    | 'no_response'              // gave up after follow-up
    | 'skipped';                 // decided not to outreach
  
  // Follow-up Tracking
  outreachDate?: string;         // when initial outreach was sent
  followUpDate?: string;         // when follow-up is due (outreachDate + 7 days)
  followUpSent?: boolean;
  
  // Response Tracking
  response?: {
    date: string;
    type: 'positive' | 'negative' | 'referral' | 'no_response';
    notes: string;               // what they said
    nextStep?: string;           // e.g. "Phone screen scheduled for 3/15"
  };
  
  // General Notes
  notes: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

---

## Outreach Scoring Logic

Auto-calculate whether outreach is worth it based on these rules:

```typescript
function calculateOutreachScore(app: Application): { score: number; worth: boolean; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Skill match (0-40 points)
  if (app.skillMatch.matchPercentage >= 70) {
    score += 40;
    reasons.push('Strong skill match (70%+)');
  } else if (app.skillMatch.matchPercentage >= 50) {
    score += 20;
    reasons.push('Moderate skill match (50-70%)');
  }
  
  // Company size (0-30 points)
  if (app.companySize === 'startup') {
    score += 30;
    reasons.push('Startup - outreach reaches decision makers');
  } else if (app.companySize === 'midsize') {
    score += 15;
    reasons.push('Mid-size - outreach may help');
  } else {
    score += 0;
    reasons.push('Enterprise - outreach unlikely to help');
  }
  
  // Posting age (0-20 points)
  if (app.postingAgeWeeks && app.postingAgeWeeks >= 2) {
    score += 20;
    reasons.push('Posted 2+ weeks - they may be struggling to fill');
  } else if (app.postingAgeWeeks && app.postingAgeWeeks >= 1) {
    score += 10;
    reasons.push('Posted 1-2 weeks');
  }
  
  // Has contact info (0-10 points)
  if (app.contact?.email) {
    score += 10;
    reasons.push('Email found - direct channel available');
  }
  
  return {
    score,
    worth: score >= 50,  // threshold: 50+ = worth outreach
    reasons
  };
}
```

---

## UI Components

### 1. Dashboard View (default)

```
+-------------------------------------------------------+
|  Outreach Tracker                    [+ Add Application]|
+-------------------------------------------------------+
|                                                         |
|  Summary Cards:                                         |
|  [12 Total] [5 Worth Outreach] [3 Sent] [1 Replied]   |
|                                                         |
|  Filter: [All] [Worth Outreach] [Needs Follow-up]      |
|          [Awaiting Response] [Completed]                |
|                                                         |
|  Sort: [Date Applied v] [Match % v] [Outreach Score v] |
+-------------------------------------------------------+
```

### 2. Application Row (in list)

```
+-------------------------------------------------------+
| Acme Corp - Frontend Engineer           Match: 85%     |
| Startup | Applied 3/1 | Posted 3 weeks ago             |
| Outreach Score: 90/100 - WORTH IT                      |
| Status: [sent] -> Follow-up due: 3/10                  |
| Contact: Jane Smith (Eng Manager) | jane@acme.com      |
+-------------------------------------------------------+
```

### 3. Add/Edit Application Modal

Fields grouped into sections:

**Job Info:**
- Company Name (required)
- Role Title (required)  
- Job Posting URL
- Date Applied (default: today)
- Resume Version Used (dropdown)

**Match Assessment:**
- Matched Skills (tag input - type and enter)
- Missing Skills (tag input)
- Match % (auto-calculated or manual override)

**Company Context:**
- Company Size (startup / midsize / enterprise)
- Posting Age (dropdown: < 1 week, 1-2 weeks, 2-4 weeks, 1+ month)

**Contact Info:**
- Contact Name
- Contact Role
- Email
- LinkedIn URL
- Source (how you found them)

**Notes:**
- Free text area

### 4. Application Detail View

Shows everything from the modal plus:

**Outreach Timeline:**
```
  [Researching] -> [Drafted] -> [Sent 3/3] -> [Follow-up due 3/10] -> [Replied 3/8!]
```

**Outreach Score Breakdown:**
```
  Skill Match:    40/40  (85% match)
  Company Size:   30/30  (Startup)
  Posting Age:    20/20  (3 weeks)
  Contact Found:  10/10  (Email)
  Total:          100/100 - STRONGLY RECOMMENDED
```

**Response Section:**
- Response Date
- Response Type (positive / negative / referral / no response)
- Notes (what they said)
- Next Step

### 5. Follow-up Reminders Panel

A sidebar or top banner showing:
```
  FOLLOW-UPS DUE:
  - Acme Corp (Jane Smith) - due today!
  - Beta Inc (Mike Lee) - due in 2 days
  - Gamma LLC (Sarah Park) - overdue by 1 day
```

---

## Integration with ResumeMatch

### Tab-based navigation
Add "Outreach Tracker" as a new top-level tab in your existing navbar:
```
[Upload] [History] [Dashboard] [Outreach Tracker]
```
Both demo and real users see this tab — demo gets read-only sample data, real users get full access (see Navigation & Auth section above).

### Flow integration (for real users only)
On the History page, after each analysis result, add a button:
```
"Match Score: 82% — [Add to Outreach Tracker]"
```
This pre-fills the application entry with:
- Matched/missing skills from the analysis
- Match percentage
- Resume version used

For demo users, this button is greyed out with tooltip: "Sign up for full access."

**Implement both.** Tab for standalone access, plus the flow button for seamless integration from History.

---

## Navigation & Auth

### Tab Placement

**Demo account:**
```
[Upload] [History] [Dashboard] [Outreach Tracker]
```

**Logged-in users (real accounts):**
```
[Upload] [History] [Dashboard] [Outreach Tracker]
```

Both see the tab — the difference is what happens inside.

### Auth Logic

```typescript
const DEMO_USER_ID = '44082468-20b1-70a3-fcaa-7d1609d83bd1';

function useIsDemo(): boolean {
  const { user } = useAuth(); // existing Cognito hook
  return user?.sub === DEMO_USER_ID;
}
```

### Demo vs Real User Behavior

| Feature | Demo Account | Real Account |
|---------|-------------|--------------|
| See Tracker tab | Yes | Yes |
| View application list | Yes (sample data) | Yes (own data from DynamoDB) |
| View outreach scores | Yes | Yes |
| Add/edit/delete entries | No (disabled) | Yes |
| Update outreach status | No (disabled) | Yes |
| "Add to Tracker" from History | No (disabled) | Yes |

### Demo Mode UI

- All action buttons (Add, Edit, Delete, Update Status) are visible but greyed out
- Disabled buttons show tooltip: "Sign up for full access"
- Optional: Add a subtle banner at top of tracker: "Demo mode — you're viewing sample data."
- Sample data is hardcoded in the frontend — no DynamoDB calls for demo user

### Sample Data for Demo

Pre-populate with 6 entries showing different states:

```typescript
const SAMPLE_DATA: Application[] = [
  {
    id: 'demo-1',
    companyName: 'Acme AI',
    roleTitle: 'Full-Stack Engineer',
    dateApplied: '2026-02-20',
    resumeVersion: 'fullstack',
    skillMatch: {
      matchedSkills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Python'],
      missingSkills: ['Go'],
      matchPercentage: 88
    },
    companySize: 'startup',
    postingAgeWeeks: 3,
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
    skillMatch: {
      matchedSkills: ['AWS', 'Terraform', 'Docker', 'CI/CD', 'Python'],
      missingSkills: ['Kubernetes production experience', 'Datadog'],
      matchPercentage: 75
    },
    companySize: 'midsize',
    postingAgeWeeks: 2,
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
    skillMatch: {
      matchedSkills: ['React', 'TypeScript', 'Next.js', 'Tailwind'],
      missingSkills: ['Vue.js', 'Storybook'],
      matchPercentage: 72
    },
    companySize: 'startup',
    postingAgeWeeks: 1,
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
    skillMatch: {
      matchedSkills: ['JavaScript', 'REST APIs', 'SQL'],
      missingSkills: ['Java', 'Spring Boot', 'Oracle', 'Kafka'],
      matchPercentage: 35
    },
    companySize: 'enterprise',
    postingAgeWeeks: 1,
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
    skillMatch: {
      matchedSkills: ['React', 'Node.js', 'PostgreSQL', 'AWS', 'TypeScript', 'Docker'],
      missingSkills: ['Redis'],
      matchPercentage: 90
    },
    companySize: 'startup',
    postingAgeWeeks: 4,
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
    skillMatch: {
      matchedSkills: ['Python', 'AWS Lambda', 'DynamoDB', 'REST APIs', 'Docker'],
      missingSkills: ['Golang', 'gRPC'],
      matchPercentage: 78
    },
    companySize: 'startup',
    postingAgeWeeks: 2,
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
```

These 6 entries cover all key states: replied (positive), sent (awaiting), researching, skipped (low score), followed up (no response), and drafted (ready to send). They also show all three resume versions in use and a mix of company sizes.

---

## Storage

Since ResumeMatch uses DynamoDB, add a new table:

```
Table: OutreachTracker
  PK: userId (from Cognito)
  SK: applicationId (UUID)
  
  GSI1: userId-outreachStatus-index
    PK: userId
    SK: outreachStatus
    
  GSI2: userId-followUpDate-index
    PK: userId
    SK: followUpDate
```

**Important:** Demo user never hits DynamoDB. Sample data is hardcoded on the frontend and loaded when `userId === DEMO_USER_ID`. Only real authenticated users read/write to DynamoDB.

For Phase 1, you can start with React state only for real users too, then add DynamoDB in Phase 4. Just make sure your data layer is abstracted so swapping is easy:

```typescript
function useApplications() {
  const isDemo = useIsDemo();
  
  if (isDemo) {
    return { data: SAMPLE_DATA, isReadOnly: true };
  }
  
  // Real user — fetch from DynamoDB (or state for MVP)
  return { data: fetchedData, isReadOnly: false };
}
```

---

## API Endpoints (if using backend)

```
POST   /api/outreach              - Create application entry
GET    /api/outreach              - List all (with filters)
GET    /api/outreach/:id          - Get single entry
PUT    /api/outreach/:id          - Update entry
DELETE /api/outreach/:id          - Delete entry
GET    /api/outreach/follow-ups   - Get due follow-ups
GET    /api/outreach/stats        - Get summary stats
```

---

## Implementation Order (suggested)

### Phase 1: Core (MVP)
1. Auth gate — demo detection using Cognito user ID
2. Data model and state management
3. Sample data for demo mode (hardcoded)
4. Add Application form (real users only)
5. Application list with basic sorting/filtering
6. Outreach score calculation
7. Basic status tracking

### Phase 2: Outreach Management
8. Contact info section
9. Outreach timeline visualization
10. Follow-up date auto-calculation
11. Follow-up reminders panel
12. Response tracking

### Phase 3: ResumeMatch Integration
13. "Add to Tracker" button on History page (real users only, greyed out for demo)
14. Auto-fill from match data
15. Dashboard summary stats

### Phase 4: Polish
16. DynamoDB persistence (if not done in Phase 1)
17. Demo banner ("Viewing sample data — sign up for full access")
18. Export to CSV
19. Analytics (response rate by company size, outreach success rate, etc.)

---

## Key Technical Decisions for You

1. **State management:** Use what you already have in ResumeMatch (Context API? Redux? React Query?)
2. **Storage first pass:** Start with React state + localStorage, migrate to DynamoDB when the feature is stable
3. **Routing:** Add React Router if not already present for tab navigation
4. **Date handling:** Use date-fns or dayjs for follow-up calculations
5. **Tag input for skills:** Build a simple one or use a library like react-tag-input

---

## Notes

- The outreach scoring thresholds (50+ = worth it) are starting values. Adjust based on your actual response rates over time.
- The 7-day follow-up window is standard. Some people prefer 5 days for startups.
- Keep the "notes" field generous. You'll want to paste job description snippets, track what you said in outreach, etc.

---

## How to Use the Tracker Tab

### Getting Started

1. **Navigate to Tracker** — Click the "Tracker" link in the top navbar. It's available to all users.
2. **Demo users** see 6 pre-loaded sample applications covering different outreach stages. All editing is disabled — create an account for full access.
3. **Real users** start with an empty tracker backed by localStorage. Your data persists across sessions.

### Adding an Application

1. Click **"+ Add Application"** in the top right.
2. Fill in the required fields: **Company Name** and **Role Title**.
3. Add matched and missing skills using the tag input — type a skill and press Enter. Match % auto-calculates if you leave it at 0.
4. Set company size and posting age to get an accurate outreach score.
5. Fill in contact info if you have it (name, role, email, LinkedIn, source).
6. Set the outreach status to track where you are in the process.
7. If you've gotten a response, fill in the response date, type, and notes.
8. Click **"Add Application"** to save.

### Adding from History (Phase 3 Integration)

After running a resume analysis, go to the **History** page. Each completed analysis shows an **"Add to Tracker"** button. Clicking it opens the Tracker's add form pre-filled with:
- Matched skills from the analysis
- Missing skills from the analysis
- Match percentage from the score

This saves you from manually re-entering skill data.

### Understanding the Dashboard

At the top of the Tracker page you'll see four stat cards:
- **Total** — all tracked applications
- **Worth Outreach** — applications scoring 50+ on the outreach scale
- **Sent** — outreach emails that have been sent (including follow-ups)
- **Replied** — applications where you've received a response

### Filtering and Sorting

Use the **filter chips** to narrow the list:
- **All** — every application
- **Worth Outreach** — only applications scoring 50+
- **Needs Follow-up** — applications with pending follow-up dates
- **Awaiting Response** — outreach sent but no reply yet
- **Completed** — replied, no response, or skipped

Use the **sort dropdown** to reorder by Date Applied, Match %, or Outreach Score.

### Outreach Scoring

Each application gets an automatic score out of 100 based on four factors:

| Factor | Points | Criteria |
|--------|--------|----------|
| Skill Match | 0-40 | 70%+ = 40 pts, 50-70% = 20 pts |
| Company Size | 0-30 | Startup = 30, Mid-size = 15, Enterprise = 0 |
| Posting Age | 0-20 | 2+ weeks = 20 pts, 1-2 weeks = 10 pts |
| Has Email | 0-10 | Direct email found = 10 pts |

**50+ = "Worth Outreach"** — this is the threshold for the recommendation badge.

### Follow-up Reminders

When you send outreach (set status to "Sent" and fill in an outreach date), the tracker automatically calculates a 7-day follow-up window. A banner at the top of the page shows:
- **Overdue** follow-ups (in red)
- **Due today** follow-ups (in accent color)
- **Upcoming** follow-ups (with days remaining)

### Viewing Application Details

Click any application card to expand its detail view, which shows:
- **Outreach score breakdown** — points per category with explanations
- **Outreach timeline** — visual progress through statuses (Not Started → Researching → Drafted → Sent → Followed Up → Replied)
- **Skills** — matched (green) and missing (red) skill tags
- **Contact info** — name, role, email, source
- **Response details** — type, notes, and next steps
- **Notes** — your free-text notes

### Editing and Deleting

From the expanded detail view, click **"Edit"** to modify any field or **"Delete"** to remove the application. These actions are only available to real (non-demo) users.

### Recommended Workflow

1. **After applying** — Add the application to the tracker with job info and skills.
2. **Research contacts** — Update status to "Researching", then add contact info when found.
3. **Draft outreach** — Update status to "Drafted" when your message is ready.
4. **Send and track** — Update status to "Sent" and set the outreach date. The 7-day follow-up timer starts.
5. **Follow up** — When the banner reminds you, send a follow-up and update status to "Followed Up".
6. **Log responses** — Fill in the response section with date, type, notes, and next steps.
7. **Review and iterate** — Use filters and sorting to focus on what needs attention.