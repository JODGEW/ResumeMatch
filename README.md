# ResumeMatch

A production-grade, fully serverless AI resume analyzer deployed on AWS — live at https://dgmqki2zr9mzh.cloudfront.net.

## How It Works

```
Upload Resume (PDF) + Paste JD → Textract OCR → Bedrock 4-Pass Analysis → DynamoDB → Results UI
```

1. **Upload** — User uploads a resume PDF and pastes the target job description
2. **Extract** — Amazon Textract pulls structured text from the PDF
3. **Analyze** — Amazon Bedrock (Claude Haiku) runs four passes: keyword extraction, match scoring, experience gap analysis, and resume rewriting
4. **Store** — Results persist in DynamoDB for fast retrieval and history
5. **Display** — Frontend renders match score with breakdown, keyword gaps with priority ranking, experience warnings, actionable suggestions, and a side-by-side diff of the rewritten resume

## Features

- **Match scoring with breakdown** — overall score ring with 5-tier color system, plus per-category bars (Technical Skills, Tools, Soft Skills, Experience)
- **Keyword gap analysis** — matched and missing keywords displayed as badges, with top priority missing keywords ranked by importance
- **Experience mismatch detection** — warns when resume experience doesn't meet JD requirements, showing required vs. stated vs. calculated years
- **Suggestions** — actionable recommendations for each missing keyword, including where to add it and why
- **AI-powered resume rewriting** — side-by-side diff view comparing original and suggested resume text
- **Resume viewer** — in-app PDF modal with download and open-in-new-tab options
- **Collapsible job description** — view the original JD alongside results
- **Cost dashboard** — cost trend sparkline chart with hover tooltips showing per-analysis cost, filename, and date
- **Analysis history** — track past submissions with score mini-rings
- **Authenticated access** — Cognito-based login with demo account support
- **Outreach tracker** — track job applications with outreach status pipeline (Not Started, Researching, Drafted, Sent, Followed Up, Replied) and application pipeline (Not Applied, Applied, Screening, Interviewing, Offer, Rejected)
- **Tracker search** — real-time search across company name, role title, and contact name with instant case-insensitive substring matching; combined with active filter for refined results
- **Outreach scoring** — weighted 0–100 score per application determining whether cold outreach is worth pursuing, based on skill match, company size, contact availability, posting age, and seniority fit
- **Follow-up reminders** — banner notifications for overdue and upcoming follow-ups with one-click "Sent" and "Skip" actions
- **Contact management** — store recruiter/hiring manager name, role, email, LinkedIn, and source per application
- **Duplicate detection** — warns before adding an application with the same company and role title

## Scoring Rubric

The AI uses the full 0–100 range. Hover over the score ring on the results page to see the interpretation.

| Score | Label | Color | Action |
|-------|-------|-------|--------|
| 86–100 | Strong Match | Green | Apply with confidence. Highlight your matched keywords in a cover letter. |
| 76–85 | Good Match | Blue | Apply and address missing keywords in your cover letter. |
| 61–75 | Moderate Match | Amber | Update your resume to include missing keywords before applying. |
| 41–60 | Weak Match | Orange | Significant gaps exist. Address them in a strong cover letter. |
| 0–40 | Poor Match | Red | This role may not be the right fit. Try better-matched opportunities. |

The score ring, label text, and history mini-rings all use the same 5-tier color system. The label is displayed inside the progress ring; the action text appears as a tooltip on hover.

## Outreach Scoring

Each application gets a 0–100 outreach score. Applications scoring 60+ are labeled **Worth Outreach**; below 60 is **Low Priority**.

The score is the sum of five weighted factors:

| Factor | Condition | Points |
|--------|-----------|--------|
| **Skill Match** (max 35) | 80%+ match | +35 |
| | 60–79% match | +25 |
| | 40–59% match | +10 |
| | < 40% match | +0 |
| **Company Size** (max 25) | Startup | +25 |
| | Mid-size | +10 |
| | Enterprise | +0 |
| **Contact Email** (max 20) | Has email | +20 |
| | No email | +0 |
| **Posting Age** (max 15) | < 1 week | +15 |
| | 1–2 weeks | +10 |
| | Unknown | +5 |
| | 2+ weeks | +0 |
| **Seniority Fit** (max 5) | Entry/Junior | +5 |
| | Mid or Unknown | +3 |
| | Senior | +0 |

The score breakdown is visible in each application's detail view.

## Architecture

Built and deployed as a fully serverless stack:

- **Compute:** AWS Lambda
- **Storage:** S3, DynamoDB
- **AI/ML:** Amazon Textract (OCR), Amazon Bedrock (Claude Haiku)
- **API:** API Gateway
- **Auth:** Cognito
- **CDN:** CloudFront
- **Frontend:** React 18, TypeScript, Vite

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173` by default.

### Build for Production

```bash
npm run build
npm run preview
```

### Demo Credentials

```
Email:    demo123@resumeapp.com
Password: ResumeApp123!?
```

## Project Structure

```
src/
  api/          # API client and endpoint functions
  auth/         # Auth context and protected route
  components/   # Reusable UI components
  config/       # AWS Amplify configuration
  hooks/        # Custom React hooks
  pages/        # Page components (Login, Upload, Results, History)
  types/        # TypeScript type definitions
```
