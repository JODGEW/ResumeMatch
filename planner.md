# Gmail Outreach Detection Integration

# 1. Overview

This feature automatically detects when a user sends a **job application or outreach email** from Gmail and suggests creating an application entry in ResumeMatch.

Example workflow:

1. User sends email to recruiter/company
2. System detects the email
3. AI extracts company + role
4. ResumeMatch prompts user to add it to their application tracker

Example notification:

```
Smart Outreach Detected

Company: Stripe
Role: Backend Engineer

[Add to Application Tracker]
[Ignore]
```

This helps users automatically track job applications without manual input.

---

# 2. Goals

Primary goals:

* Detect job-related outreach emails
* Extract company + role automatically
* Create suggested application records
* Notify users inside ResumeMatch UI

Secondary goals:

* Build an **AI job application tracker**
* Reduce manual tracking friction
* Improve ResumeMatch product value

---

# 3. Non-Goals

This feature will NOT:

* Read full private email bodies
* Store email content
* Send emails on behalf of the user
* Access inbox messages unrelated to outreach

Only metadata is processed.

---

# 4. User Flow

## 4.1 Gmail Integration Setup

User enables Gmail integration.

```
ResumeMatch Settings
   ↓
Connect Gmail
   ↓
Google OAuth
   ↓
User grants permission
```

Permission scope:

```
gmail.readonly
```

---

## 4.2 Email Detection Flow

```
User sends email
   ↓
Gmail push notification
   ↓
Webhook receives event
   ↓
Lambda fetches email metadata
   ↓
AI classification
   ↓
Company + role extracted
   ↓
ResumeMatch UI notification
```

---

# 5. High Level Architecture

```
User Gmail
   │
   ▼
Gmail Push API
   │
   ▼
Google Pub/Sub
   │
   ▼
API Gateway
   │
   ▼
Lambda Email Processor
   │
   ├── Keyword filtering
   ├── Bedrock AI classification
   └── Entity extraction
   │
   ▼
DynamoDB
(Application Tracker)
   │
   ▼
SNS / WebSocket
   │
   ▼
ResumeMatch Frontend
```

---

# 6. System Components

## 6.1 Google OAuth Integration

Used for user Gmail access.

Stored in DynamoDB:

```
UserIntegrations
```

Schema:

```
PK: user_id
SK: integration_type

Fields:
access_token
refresh_token
expires_at
created_at
```

Security:

* Tokens encrypted using **AWS KMS**
* Refresh token used to generate short-lived access tokens

---

## 6.2 Gmail Push Notifications

Gmail supports push notifications through Pub/Sub.

Workflow:

```
gmail.users.watch()
```

Events are delivered when new emails appear in **Sent Mail**.

Example event:

```
{
 "emailId": "abc123",
 "historyId": "456"
}
```

Lambda retrieves full metadata.

---

## 6.3 Lambda Email Processor

Responsibilities:

* Retrieve email metadata
* Filter outreach emails
* Call Bedrock for classification
* Extract company + role
* Save suggested application record

Input example:

```
Subject: Application for Backend Engineer Role
To: careers@stripe.com
Snippet: Hi, I recently applied...
```

Processing pipeline:

```
Keyword Filter
   ↓
AI Classification
   ↓
Company + Role Extraction
   ↓
Application Suggestion
```

---

# 7. AI Classification

Model:

```
Amazon Bedrock
Claude Haiku
```

Prompt example:

```
Determine if this email is a job application or recruiter outreach.

Subject: Application for Backend Engineer Role
Body snippet: Hi, I recently applied...

Return JSON:

{
 "job_application": true,
 "company": "...",
 "role": "..."
}
```

Expected response:

```
{
 "job_application": true,
 "company": "Stripe",
 "role": "Backend Engineer"
}
```

---

# 8. DynamoDB Data Model

Table:

```
Applications
```

Primary keys:

```
PK: user_id
SK: application_timestamp
```

Example record:

```
user_id: 123
application_id: uuid
company: Stripe
role: Backend Engineer
source: gmail
status: suggested
created_at: 2026-03-10
```

---

## Secondary Index

```
GSI1

PK: user_id
SK: company
```

Used for:

* application tracking
* analytics
* deduplication

---

# 9. Notification System

When a suggestion is created:

```
Lambda
   ↓
SNS
   ↓
WebSocket / polling
   ↓
Frontend banner
```

Example UI:

```
🔔 Outreach Detected

Stripe — Backend Engineer

[Create Application]
[Ignore]
```

---

# 10. API Endpoints

### Get Suggestions

```
GET /application-suggestions
```

Response:

```
[
 {
  company: "Stripe",
  role: "Backend Engineer",
  source: "gmail"
 }
]
```

---

### Accept Suggestion

```
POST /applications
```

Payload:

```
{
 company: "Stripe",
 role: "Backend Engineer"
}
```

---

### Ignore Suggestion

```
POST /suggestions/ignore
```

---

# 11. Security

Important considerations:

### OAuth security

* Use verified Google OAuth app
* Store tokens encrypted via KMS

### Email privacy

Only store metadata:

```
subject
recipient
timestamp
company
role
```

Never store full email bodies.

### User isolation

All data scoped by:

```
Cognito user_id
```

---

# 12. Reliability

### Idempotency

Prevent duplicate applications.

Hash key:

```
hash(subject + recipient + timestamp)
```

---

### Dead Letter Queue

Failures go to:

```
SQS DLQ
```

Retry strategy:

```
Lambda retry
DLQ fallback
manual replay
```

---

# 13. Monitoring

Metrics tracked:

```
emails_processed
job_outreach_detected
suggestions_created
suggestions_accepted
```

Logs:

```
CloudWatch Logs
```

Alerts:

```
CloudWatch Alarms
```

---

# 14. Cost Estimate

Assuming ~1000 users.

| Service     | Cost |
| ----------- | ---- |
| Lambda      | $2   |
| API Gateway | $1   |
| DynamoDB    | $2   |
| Bedrock     | $5   |
| SNS         | <$1  |

Estimated monthly:

```
~$10
```

---

# 15. Implementation Phases

## Phase 1

Basic integration.

Tasks:

* Gmail OAuth
* Email polling
* Keyword detection
* DynamoDB storage

---

## Phase 2

AI detection.

Tasks:

* Bedrock integration
* company/role extraction
* suggestion notifications

---

## Phase 3

Full automation.

Tasks:

* Gmail push notifications
* analytics dashboard
* follow-up reminders

---

# 16. Future Improvements

Possible expansions:

### AI Application Tracker

Track:

```
Applications sent
Interviews
Offers
Rejections
```

### Recruiter CRM

Store:

```
recruiter_name
recruiter_email
follow_up_date
```

### Follow-Up Assistant

AI suggests:

```
You applied 7 days ago.
Send follow-up?
```

---

# 17. Success Metrics

Feature success measured by:

```
suggestion_accept_rate
application_tracking_usage
user_retention
```

Target:

```
>40% suggestion acceptance
```