import type { SessionResponse, SessionSummary } from '../api/interview';

/**
 * Powers the demo account's Interviews tab. The shared demo user
 * (demo123@resumeapp.com) is blocked from starting real interviews (cost gate on the
 * shared account), so InterviewHistory/InterviewResults serve this canned completed
 * session instead of calling the backend — same pattern as the tracker's SAMPLE_DATA
 * and the signed-out /sample report's SAMPLE_ANALYSIS.
 *
 * PROVENANCE — do not hand-edit the session object.
 * Exported verbatim from a real production mock interview (session 2cdf1718…,
 * 2026-07-12): a behavioral round run against the Casey Morgan ↔ Bramble Commerce
 * analysis pair (61% match). Casey Morgan is a fully fictional persona, so there is
 * no real personal data here. Every question, spoken-answer transcript, per-turn
 * STAR feedback, filler-word count, and the final assessment is genuine pipeline
 * output — including the closing prompt, whose exact wording is what
 * isInterviewClosingPrompt() text-matches on restore (pinned by
 * sampleInterviewSession.test.ts).
 *
 * Exactly four structural edits were applied to the wire response:
 *   1. sessionId re-keyed to the reserved SAMPLE_INTERVIEW_SESSION_ID;
 *   2. analysisId re-pointed at DEMO_BRAMBLE_ANALYSIS_ID (see below);
 *   3. whitelisted to the SessionResponse type — null roleName/companyName and the
 *      first turn's questionId dropped;
 *   4. jobDescription whitespace restored to the owner's original JD text (the wire
 *      copy came back hard-wrapped at ~80 columns; whitespace-only difference — the
 *      analysis cache key normalizes whitespace, so it is the same analysis pair).
 *
 * To refresh: rerun a mock interview from the Bramble Commerce analysis (the
 * analysis pipeline cache makes reproducing the pair free), copy the
 * GET /interview/sessions/:id response from the network tab, and re-apply the three
 * edits above.
 */

/**
 * The DEMO ACCOUNT'S own analysisId for the Casey Morgan ↔ Bramble Commerce pair.
 * "View Full Analysis" on the sample session links to /results/<this id> and is
 * fetched with the demo user's JWT, so it must be the demo account's row — another
 * account's copy of the same analysis would 404 for demo visitors. To verify: open
 * the Bramble Commerce analysis while signed in as demo123 and compare the
 * /results/<id> URL; swap this value if it differs.
 */
export const DEMO_BRAMBLE_ANALYSIS_ID = '8c9607e1-9da2-46c7-822c-5105a65ad338';

/** Reserved route id: InterviewResults serves the canned session for this id (demo only). */
export const SAMPLE_INTERVIEW_SESSION_ID = 'sample-interview';

export const SAMPLE_INTERVIEW_SESSION: SessionResponse = {
  sessionId: SAMPLE_INTERVIEW_SESSION_ID,
  status: "completed",
  interviewType: "behavioral",
  jobTitle: "Full-Stack Software Development Engineer @ Bramble Commerce",
  analysisId: DEMO_BRAMBLE_ANALYSIS_ID,
  fileName: "casey_morgan_resume.pdf",
  matchScore: 61,
  jobDescription: "Bramble Commerce — Full-Stack Software Development Engineer (SDE)\nLocation: Seattle, WA (Hybrid)\n\nAbout Bramble Commerce\nBramble Commerce builds the headless commerce APIs that power direct-to-consumer brands. We are a small, product-driven team in Seattle focused on giving developers clean primitives for catalog, cart, and checkout, so brands can ship storefronts in days instead of quarters.\n\nThe Role\nWe are looking for a Full-Stack Software Development Engineer to join our Core Experience team. In this role you own merchant-facing features end to end: designing responsive React UI, then architecting the event-driven services behind them on AWS. You will work in a high-growth environment where your code directly impacts thousands of transactions per second.\n\nResponsibilities\nFeature Ownership: Design, develop, and deploy end-to-end features for our merchant\ndashboard and checkout services.\nFront-End Excellence: Build and maintain scalable, high-performance web applications using React and TypeScript.\nBackend Architecture: Develop and optimize Node.js microservices and RESTful APIs that power our core order and inventory workflows.\nCloud Infrastructure: Leverage AWS native services including Lambda, API Gateway, DynamoDB, and S3 to build resilient, serverless architectures.\nSecurity & Auth: Implement and maintain secure authentication and authorization protocols using JWT and OAuth2.\nQuality Assurance: Write comprehensive unit, integration, and E2E tests using Jest and Cypress to ensure 99.9% system uptime.\nCollaboration: Participate in design reviews, sprint planning, and blameless post-mortems while mentoring junior engineers.\nOperational Excellence: Monitor production health using CloudWatch and Datadog; troubleshoot and resolve performance bottlenecks.\n\nRequired Qualifications\n2+ years of professional experience in full-stack software development. Strong proficiency in JavaScript and TypeScript.\nDirect production experience with React (Hooks, Context API, State Management).\nDeep understanding of Node.js and experience building scalable REST APIs.\nHands-on experience with AWS Serverless environments (specifically Lambda and DynamoDB).\nFamiliarity with containerization (Docker) and modern CI/CD tools like GitHub Actions.\nA solid grasp of CS fundamentals: data structures, algorithms, and system design.\nExcellent communication skills and a desire to work in a collaborative, hybrid environment.",
  conversation: [
    {
      role: "interviewer",
      content: "Walk me through your background as a software engineer. What drew you to full-stack development, and how has your experience evolved from EduTech Solutions to SaaS Peak?",
      timestamp: 1783894329
    },
    {
      fillerWords: {
        actually: 1
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "Studied computer science at the University of wash Washington and graduated in 2024. What actually put me toward full stack was a project I built right after school, a real time collaborative document editor using React, TypeScript dot I o. I had to write the UI and the server side conflict resolution together, and neither have made sense without the other. Seeing a keystroke in one browser turn into synchronized stay across sessions. The end to end feature is what hooked me. My first job was ideotech solution as a junior developer, the work land lean back end, and you taught me fundamentals under real pressure. The platform supported high traffic student enrollment periods, so reliability wasn't theoretical. I implemented JWT authentication and role based access control for user profiles, automated internal reporting with Python scripts that improve data processing efficiency by about 35, and we can test coverage around 80% with MoCA and one link through Jenkins. A lot of it was maintenance work, but that's where I built my habits around testing and security. SaaS peak was the jump to real ownership. I was shipping features end to end on a biweekly cadence in a team. On the front end, I build user facing dashboards, and we end task grid with it does handling state. And part of the that work was tightening up UI responsiveness. On the back end, I went from working in one express code base to building the microservices on Azure functions, handling real time data sync for over a thousand daily active users. The work I enjoy most was performance tuning. I cut endpoint latency by about 20% mostly by optimizing how we curried PostgreSQL.",
      timestamp: 1783894642
    },
    {
      content: "Tell me about a time when you owned a feature end-to-end, from design through deployment. What was the feature, what challenges did you face, and how did you approach solving them?",
      role: "interviewer",
      timestamp: 1783894644
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Clear end-to-end ownership mindset; owned design, backend, frontend, and deployment",
          "Proactive performance troubleshooting; identified and fixed root cause rather than surface-level optimization"
        ],
        improvements: [
          "Result lacks specifics on the PostgreSQL fix itself—knowing the exact optimization (indexing, query rewrite, N+1 resolution) would strengthen the answer",
          "No mention of testing strategy or observability during the rollout to production"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "At SAS pick, I own a real time data sync feature for our customer dashboard end to end. Users will sync style data unless they manually refresh. I designed the solution as a no microservice on Azure functions, wrote the rest endpoints, and build the React side with Redux to consume the updates. The main challenge was latency. Early versions felt sluggish, and I traced it to if inefficient PostgreSQL queries. I restructured them and cut endpoint latency by about 20%. I shipped it to our Docker based pipeline on a biweekly release and ended up serving over a thousand daily active users. That project taught me to treat performance as part of the design, not a cleanup step.",
      timestamp: 1783894717
    },
    {
      content: "That's a solid example. When you hit that latency issue, walk me through exactly what you found in the PostgreSQL queries—what was the inefficiency, and what specific changes did you make to cut it by 20%?",
      role: "interviewer",
      timestamp: 1783894720
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Demonstrated deep technical troubleshooting—identified root cause (missing index + N+1 queries) with query plans",
          "Proactive about performance optimization and treating it as a design concern, not afterthought"
        ],
        improvements: [
          "Could strengthen by mentioning monitoring/observability tools used to detect the latency issue initially",
          "No mention of testing or rollout strategy to validate the optimization in production"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "Sure. The dashboard endpoint the dashboard endpoint was making one query per reach, so a single page load fire of six or seven round trips to PostgreSQL. And two of those queries were doing sequential scans on a large events table because we were flip filtering on a time stamp, colon, that had no index. So I made two changes. First, I added a composite index on customer ID plus time stamp, which turned those scans into index lookups. Second, I consolidated the per rigid queries into one query with joints so the servers make a single round chip and shape the data in node. I verify it with the query plans before and and after, and the p 95 endpoint latency dropped about 20%.",
      timestamp: 1783894800
    },
    {
      content: "Describe a situation where you had to optimize performance in a production system. What metrics were you trying to improve, what did you discover, and what was the outcome?",
      role: "interviewer",
      timestamp: 1783894802
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Clear ownership of end-to-end features with measurable impact (35% efficiency gain, consistent reporting)",
          "Proactive problem-solving: identified root cause (manual bottleneck) and owned the solution entirely"
        ],
        improvements: [
          "Could have mentioned testing or deployment confidence for the Python scripts",
          "Limited detail on how the solution was monitored post-deployment"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "E2E Tech Solutions, our internal reporting pipeline was becoming a real bottleneck. We paused the operations in team, needed daily, were taking hours to generate. And during enrollment periods, when traffic picked, they sometimes finished too late to be useful. The metric I care about was end to end processing time. When I dug in, I found the process was mostly manual. Someone pulling the data and stitching it together with a lot of redundant passes over the same records. I wrote Python scripts to automate the pipeline, batching the data pools and eliminate eliminating the duplicate processing. That improved processing efficiency by about 35%, and reports were consistently ready. When the ops team started their day. It also freed us from babysitting the process during peak enrollment.",
      timestamp: 1783894890
    },
    {
      content: "Tell me about a time when you disagreed with a teammate or stakeholder on the technical approach. How did you handle it, and what did you learn?",
      role: "interviewer",
      timestamp: 1783894892
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Strong problem-solving mindset—demonstrated by running a proof-of-concept to resolve disagreement rather than escalating",
          "Data-driven decision making—used concrete metrics (setup time reduction) to justify technical choices"
        ],
        improvements: [
          "Could have elaborated on how the disagreement affected the timeline or team velocity after resolution",
          "Opportunity to discuss what you'd do differently if the senior engineer hadn't been convinced by the demo"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "As SaaS pick, when we were standing up new microservices, I pushed to make Docker our standard for local development. A senior team may disagree. He felt it added overhead and that's our read me set up instructions were fine. His view was that container startup and the learning curve would slow the team down. Rather than debate obstructly, I can't analyze one service as a proof of concept and time of fresh setup, minutes instead of the better part of the day, and no more words on my machine bugs between us and CI. I showed that at our next team discussion, and he came on around. We adapted it across the services. What I learned is that in technical disagreements, a small working demo moves the conversation further than argument does.",
      timestamp: 1783894983
    },
    {
      content: "Walk me through a project where you had to learn a new technology or framework quickly under time pressure. How did you approach it, and what was the result?",
      role: "interviewer",
      timestamp: 1783894985
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Demonstrates deliberate learning approach: builds throwaway prototypes before production work, validates with code review feedback",
          "Clear ownership mindset: shipped real-time sync service on schedule serving 1000+ users; applies learning patterns across technologies"
        ],
        improvements: [
          "Limited mention of scaling challenges or infrastructure bottlenecks beyond single service; role requires architecting event-driven systems at scale",
          "No discussion of testing strategy (unit/integration/E2E) for the Azure Functions work; Jest/Cypress expertise not yet demonstrated"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "John. The team was moving back and work to Azure functions, and I never touched servers. My experience was traditional express servers. I have roughly a sprint to get productive because I was on the hook for a real time sync service. My approach was to build a small throw throwaway function first just to understand triggers, bindings, and code start before touching production code. Then I ported one narrow endpoint, guided through code review, and used that feedback to calibrate. The sync server shipped on schedule and now serves a thousand plus daily users. That pattern stuck with me, and I use it again learning CloudWatch CloudWan, and PubSub for a personal GCP project.",
      timestamp: 1783895066
    },
    {
      content: "Tell me about a time when a feature or deployment failed in production or staging. What happened, how did you respond, and what did you change to prevent it in the future?",
      role: "interviewer",
      timestamp: 1783895069
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Clear ownership of the debugging and fix—identified root cause, implemented solution same day, and added behavioral tests",
          "Strong learning mindset—shifted testing philosophy from coverage metrics to behavior-driven validation, generalizes insight to future work"
        ],
        improvements: [
          "Could have mentioned how the fix was communicated to the team or stakeholders after the incident",
          "Didn't mention any observability/monitoring that could have caught this earlier (relevant to Bramble's CloudWatch/Datadog focus)"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "E2 tech where I wrote our JWT based authentication, the deployment, pass review, and our test suite. But in staging, we started seeing users get logged out my mid session. I'd misconfig the token expiry against the refresh flow, so sessions died early. The worst part was our test never caught it because they validated tokens as at a single point in time, not across a session's lifespan. I wrote it back the same day, fixed the expiry logic, and before re redeploying, I added MoCA test that simulated full session life cycles, logging, token refresh, expiry. The bigger challenge the bigger change was to how I test coverage percentage wasn't the issue. We had 80%. It's that we were testing snapshots instead of instead of behavior behavior over time. That this that distinction that distinction stuck with me.",
      timestamp: 1783895168
    },
    {
      content: "Describe your experience with AWS services. While your resume shows Azure and GCP experience, can you tell me about a time you've worked with Lambda, DynamoDB, or similar AWS serverless primitives, or how you'd approach learning them?",
      role: "interviewer",
      timestamp: 1783895170
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Demonstrated strong learning velocity and systematic approach to unfamiliar technologies (Azure Functions under sprint pressure, throwaway prototypes)",
          "Shows ownership mentality with concrete examples of end-to-end feature delivery and measurable performance improvements (20% latency reduction, 35% efficiency gain)"
        ],
        improvements: [
          "No direct AWS production experience (Lambda, DynamoDB, API Gateway)—relying on transferability from Azure/GCP rather than hands-on familiarity",
          "Limited evidence of handling large-scale distributed systems or designing for high transaction throughput (1000 DAU is solid but below the 'thousands of transactions per second' requirement)"
        ]
      },
      fillerWords: {
        like: 1
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "Honestly, I haven't used AWS in production. My serverless work has been on Azure functions and GCP, but the context map pretty directly. Lambda is the same event driven model as Azure Functions, where I build production microservices and deal with cold start triggers and status design. Pub and sub taught me event driven pipelines, which is the same pattern as Lambda's plus SQS or DynamoDB strings. The generic the generally new piece for me is DynamoDB. Single table design and partition key modeling is a different mindset from PostgreSQL. My approach will be the same one. I use learning Azure under a sprint deadline. Be a smart throwaway project first. In this case, model something like a card and order flow, then import a narrow view endpoint and get feedback through",
      timestamp: 1783895255
    },
    {
      content: "Tell me about a time you mentored a junior engineer or helped unblock a teammate. What was the situation, and how did you contribute to their growth?",
      role: "interviewer",
      timestamp: 1783895258
    },
    {
      feedback: {
        star: {
          result: true,
          action: true,
          task: true,
          situation: true
        },
        strengths: [
          "Honest about experience gaps (AWS) and demonstrated ability to learn quickly under pressure with proven patterns",
          "Clear growth mindset—acknowledges junior status, self-aware about mentoring gap, and actively seeking to develop this skill"
        ],
        improvements: [
          "No production AWS experience is a gap for the role; needs concrete commitment to prioritize Lambda/DynamoDB ramp-up",
          "Limited cross-functional or stakeholder collaboration examples; most stories are technical execution focused"
        ]
      },
      role: "candidate",
      transcriptClarity: "clear",
      content: "Be straight with you. I haven't had a formal mentoring relationship yet. At one and a half years in, I have used usually been the one being mentored, but I can point to where I have helped teammates in smaller ways. The clearest example is the Docker rollout at SaaS page. After we update it, I was the person who gone debits on it, So I ended up walking teammates through a container basics, writing the set of bugs, and being the go to when someone's local environment broke. A couple of engineers who never touch never touch Docker comfortable with it probably through through the those sessions. So while I can't claim mentorship experience, teaching something I just learned show me I enjoy this that side of the work, and it's something I actively looking to grow into my next world.",
      timestamp: 1783895346
    },
    {
      content: "Imagine you've just joined the Core Experience team and discover that a critical merchant dashboard feature is performing slowly during peak traffic. You have competing priorities from three different stakeholders. How would you approach this situation?",
      role: "interviewer",
      timestamp: 1783895349
    },
    {
      role: "candidate",
      transcriptClarity: "clear",
      content: "First thing, I get data before I take size. I'd pull the mentor monitoring and check whether it's front end rendering, API latency, or the database because the access pick our dashboard slowness turned out to be query level, and the diagnosis changed everything about the fix. In parallel, I'd get the three stakeholders ask in one place and be transparent with them. Here's what I found. Here's the impact of each option, and here's what I sequenced first and why. If the dashboard issue is splitting merchant trust during peak traffic, that data usually makes the priority call for itself. And I let my managers see the same trade off rather than negotiating through rates in pirate. Then ship the target fixed first and lock the and lock the deeper refractor as a follow-up follow-up rather than trying to solve everything at once.",
      timestamp: 1783895448
    },
    {
      content: "That's all the questions I have for you today. Click 'View report' whenever you're ready to see your assessment and transcript.",
      role: "interviewer",
      timestamp: 1783895448
    }
  ],
  totalDuration: 1130,
  endReason: "all_questions_answered",
  createdAt: "2026-07-12T22:12:09.350892+00:00",
  completedAt: "2026-07-12T22:31:25.687494+00:00",
  timeLimit: 1500,
  totalQuestions: 10,
  createdAtEpoch: 1783894329,
  assessment: {
    summary: "The candidate demonstrates solid full-stack fundamentals, genuine ownership of past features, and a credible learning-under-pressure track record backed by concrete metrics. Answers follow a mostly clear STAR structure with specific technical detail—notably the PostgreSQL optimization deep-dive—though depth thins out on AWS experience and mentorship, and some responses contain minor redundancy. Overall, a strong junior-to-mid candidate whose honesty about gaps and consistent use of measurable outcomes make them a competitive fit for the role.",
    overallRating: "Good",
    strengths: [
      "Deep technical specificity on the PostgreSQL optimization: the candidate unprompted identified N+1 queries, sequential scans on an un-indexed timestamp column, composite index strategy, and P95 latency verification via query plans—demonstrating production-grade debugging discipline that directly matches the JD's performance-tuning responsibilities.",
      "Consistent, honest use of quantified outcomes (35% efficiency gain, 20% latency reduction, 80% test coverage, 1,000+ DAU) across multiple roles, giving interviewers concrete evidence rather than vague claims of impact.",
      "Exceptional self-awareness and gap transparency: the candidate proactively acknowledged no AWS production experience, offered a specific transfer model (Azure Functions → Lambda, Pub/Sub → SQS/DynamoDB Streams), and described a concrete ramp-up plan mirroring a real sprint they successfully completed—turning a potential red flag into a credibility signal."
    ],
    overallScore: 77,
    transcriptClarityStats: {
      clarityRatio: 1,
      unclearTurnCount: 0,
      clearTurnCount: 10,
      candidateTurnCount: 10
    },
    categories: [
      {
        name: "Communication Structure",
        score: 78,
        weight: 0.2,
        comment: "Most answers follow a logical arc: context → problem → action → result. The walkthrough of background, the Docker disagreement, and the hypothetical dashboard scenario are particularly well-organized. A few responses (e.g., the mentorship question) meander slightly before landing the point, and the production failure answer repeats the phrase 'that distinction' awkwardly, but overall the intended structure is clear and interpretable."
      },
      {
        name: "STAR Framework Usage",
        score: 75,
        weight: 0.25,
        comment: "The candidate applies Situation-Task-Action-Result consistently across most questions. The PostgreSQL latency answer and the Docker proof-of-concept story are textbook STAR executions. The performance optimization story at EduTech is slightly weaker on the Task framing, and the mentorship answer explicitly acknowledges no direct experience, which is honest but leaves the Result thin. No answer is entirely missing a STAR component."
      },
      {
        name: "Specificity & Metrics",
        score: 80,
        weight: 0.25,
        comment: "Strong use of concrete numbers throughout: 35% improvement in data processing efficiency, 20% reduction in P95 endpoint latency, 80% test coverage, 1,000+ daily active users, biweekly cadence. The PostgreSQL follow-up was particularly impressive—composite index on customer_id + timestamp, N+1 query consolidation, query plan verification. The only gaps are in the mentorship answer (no measurable outcome) and the AWS answer (naturally hypothetical)."
      },
      {
        name: "Role Relevance",
        score: 74,
        weight: 0.2,
        comment: "The candidate maps well to the JD's React/TypeScript, Node.js microservices, JWT/auth, Docker, and CI/CD requirements. Real production experience with serverless (Azure Functions) is directly analogous to Lambda. The honest acknowledgment of no AWS production experience is a meaningful gap for this AWS-native role, partially offset by a credible and specific transfer plan. No DynamoDB experience is a notable absence given the JD's emphasis on it."
      },
      {
        name: "Self-Awareness",
        score: 82,
        weight: 0.1,
        comment: "Consistently high. The candidate clearly flags no AWS production experience and articulates exactly why the gap is bridgeable. The mentorship answer directly admits limited formal experience rather than inflating it. The JWT post-mortem reflection—'testing snapshots instead of behavior over time'—shows genuine learning rather than deflection. This is one of the candidate's clearest differentiators."
      }
    ],
    improvements: [
      "AWS and DynamoDB depth is the most significant gap for this role. The candidate should build a hands-on portfolio project—e.g., a cart/order flow using Lambda, API Gateway, and DynamoDB with single-table design—so they can speak to partition key modeling, GSIs, and cold-start mitigation with concrete numbers rather than conceptual analogies.",
      "Mentorship and collaboration answers lack substance. With only one weak example (Docker walkthroughs), the candidate should develop richer stories around code reviews, pair programming, or onboarding contributions, and practice framing them with measurable outcomes such as ramp-up time reduced or PR review cycles shortened.",
      "Some answers (notably the background walkthrough and the production failure story) contain mild redundancy and self-interruption that slightly dilute impact. Practicing tighter editing—cutting to the specific action and result faster—would sharpen delivery, especially for the opening biography which ran long before reaching the metrics."
    ],
    clarityAdjusted: false
  },
  keyterms: [
    "JavaScript",
    "TypeScript",
    "Docker",
    "GitHub",
    "CI/CD",
    "REST",
    "JWT",
    "UI",
    "WA",
    "CloudWatch",
    "DynamoDB",
    "Datadog",
    "OAuth2",
    "API",
    "AWS",
    "E2E",
    "SDE",
    "CS",
    "S3",
    "Google Cloud",
    "JWT/OAuth2",
    "PostgreSQL",
    "Firebase",
    "HTML/CSS",
    "LinkedIn",
    "EduTech",
    "MongoDB",
    "DevOps",
    "Azure",
    "MySQL",
    "Redis",
    "Jira",
    "JWT/",
    "RBAC",
    "SaaS",
    "ES6",
    "GCP",
    "SQL"
  ]
};

export const SAMPLE_INTERVIEW_SUMMARY: SessionSummary = {
  sessionId: SAMPLE_INTERVIEW_SESSION_ID,
  interviewType: SAMPLE_INTERVIEW_SESSION.interviewType,
  jobTitle: SAMPLE_INTERVIEW_SESSION.jobTitle,
  analysisId: DEMO_BRAMBLE_ANALYSIS_ID,
  fileName: SAMPLE_INTERVIEW_SESSION.fileName,
  matchScore: SAMPLE_INTERVIEW_SESSION.matchScore,
  status: SAMPLE_INTERVIEW_SESSION.status,
  questionCount: 10,
  totalDuration: SAMPLE_INTERVIEW_SESSION.totalDuration,
  createdAt: SAMPLE_INTERVIEW_SESSION.createdAt,
  completedAt: '2026-07-12T22:31:25.687494+00:00',
};
