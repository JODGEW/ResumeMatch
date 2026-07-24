import type { Analysis } from './index';

/**
 * Powers the shared demo account's Analysis History and Analysis Detail pages.
 *
 * The demo user (demo123@resumeapp.com) is read-only: uploads are blocked in the
 * UI (cost + privacy on the shared account) and History/Results serve these
 * fixtures instead of calling the backend — same pattern as the tracker's
 * SAMPLE_DATA, the interview tab's SAMPLE_INTERVIEW_SESSION, and the signed-out
 * /sample report's SAMPLE_ANALYSIS.
 *
 * PROVENANCE — do not hand-edit these objects. GENERATED, not hand-written:
 * exported 2026-07-22 from the three live demo-account records via
 * GET /analysis/{analysisId} with a demo ID token, then projected through the
 * same typed whitelist as SAMPLE_ANALYSIS (drops tokenUsage, s3Key, userId,
 * cache fields, resumeText, extractedKeywords, originalSchema*; coerces
 * DynamoDB string numbers). All three personas are fictional (555 numbers).
 *
 * Array order IS the display order (History serves it verbatim, newest first):
 * casey → jordan → alex. Each fileName matches a PDF in public/demo-resumes/
 * (gitignored; ships via local build + S3 sync — see .gitignore), which is what
 * View Resume serves for these records instead of minting a presigned URL.
 *
 * All three are zero-edit records (suggestedText === originalText), so the demo
 * always shows the "No safe rewrites" state and never the download CTA.
 *
 * To refresh: run the resume+JD pair on YOUR OWN account (CACHE_BYPASS=true if
 * re-running an identical pair), export via GET /analysis/{id}, re-apply the
 * whitelist, and update the matching PDF if the resume changed. The original
 * demo-account uploads these came from are purged; the fixtures + PDFs are the
 * only remaining source.
 */
export const DEMO_ANALYSES: Analysis[] = [
  {
    "analysisId": "8c9607e1-9da2-46c7-822c-5105a65ad338",
    "status": "completed",
    "createdAt": "2026-07-12T16:12:53.240460+00:00",
    "fileName": "casey_morgan_resume.pdf",
    "jobTitle": "Full-Stack Software Development Engineer @ Bramble Commerce",
    "matchScore": 61,
    "matchedCount": 20,
    "totalCount": 33,
    "scoreSummary": "Candidate has strong full-stack fundamentals in TypeScript, React, and Node.js with serverless and microservices experience, but lacks critical AWS-specific skills (Lambda, DynamoDB, API Gateway) and testing tools (Jest, Cypress) required for this role, plus only 1.5 years of experience versus the 2+ year requirement.",
    "scoreSummaryShort": "Strong fullstack foundation — missing AWS stack, insufficient experience",
    "scoreBreakdown": {
      "softSkills": 60,
      "technical": 67,
      "experience": 25,
      "tools": 35
    },
    "presentKeywords": [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "REST APIs",
      "JWT",
      "Docker",
      "Data Structures",
      "Algorithms",
      "System Design",
      "Microservices",
      "Serverless Architecture",
      "Communication",
      "Collaboration",
      "Problem-solving",
      "State Management Libraries",
      "E2E Testing",
      "Production Monitoring",
      "Performance Optimization",
      "OAuth2"
    ],
    "missingKeywords": [
      "AWS Lambda",
      "DynamoDB",
      "React Hooks",
      "Context API",
      "Jest",
      "Cypress",
      "AWS API Gateway",
      "AWS S3",
      "CloudWatch",
      "Datadog",
      "GitHub Actions",
      "Mentoring",
      "Design Review Participation"
    ],
    "topMissing": [
      {
        "keyword": "AWS Lambda",
        "importanceScore": 10,
        "reason": "AWS Lambda is a hard required qualification explicitly listed under both Responsibilities and Required Qualifications, and is central to the serverless architecture that powers Bramble Commerce's core order and checkout services."
      },
      {
        "keyword": "DynamoDB",
        "importanceScore": 9,
        "reason": "DynamoDB is called out as a hard required qualification under both the Cloud Infrastructure responsibility and Required Qualifications sections, making it a non-negotiable technical skill for the serverless backend this role owns."
      },
      {
        "keyword": "React Hooks",
        "importanceScore": 8,
        "reason": "React Hooks is explicitly named as a required production-level skill under Required Qualifications and is directly tied to the role's core front-end responsibility of building the merchant dashboard."
      },
      {
        "keyword": "Jest",
        "importanceScore": 7,
        "reason": "Jest is a named tool in the Quality Assurance responsibility tied directly to the 99.9% uptime SLA requirement, making it a high-priority testing skill for this role."
      },
      {
        "keyword": "GitHub Actions",
        "importanceScore": 6,
        "reason": "GitHub Actions is explicitly cited under Required Qualifications as a modern CI/CD tool the candidate must be familiar with, making it a hard requirement that outranks monitoring and soft-skill gaps."
      }
    ],
    "suggestions": [
      {
        "keyword": "AWS Lambda",
        "reason": "Job requires hands-on AWS Lambda experience; resume shows Azure Functions and GCP Cloud Run instead. AWS is the required cloud provider.",
        "whereToAdd": "Work experience or projects section highlighting any AWS Lambda work, or update to include AWS migration experience"
      },
      {
        "keyword": "DynamoDB",
        "reason": "Critical requirement for this role; resume shows PostgreSQL, MongoDB, and MySQL but no DynamoDB experience.",
        "whereToAdd": "Consider adding a project or work experience demonstrating NoSQL database design with DynamoDB"
      },
      {
        "keyword": "Jest",
        "reason": "Job explicitly requires Jest for testing; resume mentions Mocha/Chai instead.",
        "whereToAdd": "Update technical skills or add a project demonstrating Jest usage for unit/integration testing"
      },
      {
        "keyword": "Cypress",
        "reason": "Job requires Cypress for E2E testing; resume does not mention it.",
        "whereToAdd": "Add Cypress experience to projects or work experience section"
      },
      {
        "keyword": "GitHub Actions",
        "reason": "Job requires GitHub Actions for CI/CD; resume shows Jenkins instead.",
        "whereToAdd": "Update CI/CD tools section or add a project using GitHub Actions"
      },
      {
        "keyword": "AWS API Gateway",
        "reason": "Job requires AWS API Gateway; resume shows REST APIs but not specifically API Gateway.",
        "whereToAdd": "Add AWS API Gateway experience to cloud services or projects"
      },
      {
        "keyword": "AWS S3",
        "reason": "Job requires S3 experience; not mentioned in resume.",
        "whereToAdd": "Add S3 usage to projects or work experience"
      },
      {
        "keyword": "CloudWatch",
        "reason": "Job requires CloudWatch for production monitoring; resume mentions general monitoring but not CloudWatch.",
        "whereToAdd": "Add CloudWatch experience to operational excellence or monitoring section"
      },
      {
        "keyword": "Datadog",
        "reason": "Job requires Datadog for production monitoring; not mentioned in resume.",
        "whereToAdd": "Add Datadog experience if available, or highlight monitoring tools used"
      },
      {
        "keyword": "React Hooks",
        "reason": "Job requires React Hooks; resume mentions React and Redux but not Hooks explicitly.",
        "whereToAdd": "Add React Hooks to technical skills or highlight Hook usage in projects"
      },
      {
        "keyword": "Context API",
        "reason": "Job requires Context API; resume shows Redux for state management but not Context API.",
        "whereToAdd": "Add Context API experience to technical skills or projects"
      },
      {
        "keyword": "Mentoring",
        "reason": "Job requires mentoring junior engineers; resume does not mention mentoring experience.",
        "whereToAdd": "Add mentoring or leadership experience if available"
      },
      {
        "keyword": "Design Review Participation",
        "reason": "Job requires participation in design reviews; resume mentions Agile collaboration but not design reviews specifically.",
        "whereToAdd": "Highlight design review participation in work experience descriptions"
      }
    ],
    "experienceCheck": {
      "requiredYears": "2+",
      "resumeStatedYears": "1.6",
      "actualYears": "1.2",
      "displayYears": "1.5",
      "hasMismatch": true,
      "warning": "Candidate has 1.5 years of experience, which is below the required minimum of 2.0 years.",
      "recommendation": "Consider highlighting relevant experience more clearly or targeting roles aligned with current experience level."
    },
    "originalText": "Casey Morgan\nc.morgan@email.com 206-555-0122 LinkedIn GitHub\nSoftware Engineer with 1.6 years of experience building full-stack web applications and microservices. Proficient in TypeScript,\nReact, and Node.js with a focus on cloud-native deployments (Azure/GCP) and relational database design. Experienced in\nAgile environments and shipping features through containerized CI/CD pipelines.\nWORK EXPERIENCE\nSoftware Engineer Seattle, WA\nSaaS Peak Jul 2025 - Feb 2026\nDeveloped and scaled user-facing dashboards using React and TypeScript, optimizing state management with\nRedux and improving UI responsiveness.\nEngineered backend microservices using Node.js on Azure Functions, facilitating real-time data synchroniza-\ntion for 1,000+ daily active users.\nDesigned and implemented RESTful APIs to handle complex customer data workflows, reducing endpoint\nlatency by 20% through optimized PostgreSQL queries.\nCollaborated in an Agile team to ship bi-weekly features, utilizing Docker for local development consistency.\nJunior Software Developer Remote\nEduTech Solutions Oct 2024 - Jun 2025\nMaintained and enhanced a full-stack educational platform using Node.js and Express, supporting high-traffic\nstudent enrollment periods.\nImplemented secure JWT-based authentication and role-based access control (RBAC) to ensure data privacy\nfor user profiles.\nAutomated internal reporting tasks by writing scripts in Python, increasing data processing efficiency by 35%.\nUtilized Jenkins for CI/CD automation and maintained 80% code coverage using the Mocha/Chai testing frame-\nwork.\nPROJECTS\nServerless Inventory Manager\nGCP, Node.js, MongoDB Jan 2026 - Present\nBuilt a serverless inventory tracking system on Google Cloud Platform using Cloud Run and Cloud Pub/Sub\nfor event-driven updates.\nIntegrated a MongoDB backend to store dynamic product schemas, enabling flexible filtering for diverse retail\nitems.\nDevOps Automation Suite\nDocker, Jenkins, Bash May 2025 - Aug 2025\nCreated a centralized CI/CD pipeline in Jenkins that automates linting, unit testing, and Docker image de-\nployment to a private registry.\nDeveloped custom Bash scripts to monitor container health and automate rollbacks in staging environments.\nReal-time Collaborative Editor\nTypeScript, React, Socket.io Jun 2024 — Sept 2024\nArchitected a web-based document editor using React and Socket.i to support concurrent editing across mul-\ntiple sessions.\nUtilized TypeScript for robust type-safety and implemented a conflict resolution algorithm to handle simulta-\nneous data synchronization.\nTECHNICAL SKILLS\nProgramming: TypeScript, JavaScript (ES6+), Python, SQL, HTML/CSS\nFrameworks & Libraries: React, Node.js, Express, Redux, Mocha, Chai, Socket.io\nCloud & DevOps: Azure Functions, Google Cloud Platform (GCP), Docker, Jenkins, Firebase\nDatabases: PostgreSQL, MongoDB, Redis, MySQL\nDeployment & Optimization: CI/CD (Jenkins), REST APIs, JWT/OAuth2, Git, Jira\nEDUCATION\nUniversity of Washington Aug 2020 - May 2024\nBachelor of Science in Computer Science",
    "suggestedText": "Casey Morgan\nc.morgan@email.com 206-555-0122 LinkedIn GitHub\nSoftware Engineer with 1.6 years of experience building full-stack web applications and microservices. Proficient in TypeScript,\nReact, and Node.js with a focus on cloud-native deployments (Azure/GCP) and relational database design. Experienced in\nAgile environments and shipping features through containerized CI/CD pipelines.\nWORK EXPERIENCE\nSoftware Engineer Seattle, WA\nSaaS Peak Jul 2025 - Feb 2026\nDeveloped and scaled user-facing dashboards using React and TypeScript, optimizing state management with\nRedux and improving UI responsiveness.\nEngineered backend microservices using Node.js on Azure Functions, facilitating real-time data synchroniza-\ntion for 1,000+ daily active users.\nDesigned and implemented RESTful APIs to handle complex customer data workflows, reducing endpoint\nlatency by 20% through optimized PostgreSQL queries.\nCollaborated in an Agile team to ship bi-weekly features, utilizing Docker for local development consistency.\nJunior Software Developer Remote\nEduTech Solutions Oct 2024 - Jun 2025\nMaintained and enhanced a full-stack educational platform using Node.js and Express, supporting high-traffic\nstudent enrollment periods.\nImplemented secure JWT-based authentication and role-based access control (RBAC) to ensure data privacy\nfor user profiles.\nAutomated internal reporting tasks by writing scripts in Python, increasing data processing efficiency by 35%.\nUtilized Jenkins for CI/CD automation and maintained 80% code coverage using the Mocha/Chai testing frame-\nwork.\nPROJECTS\nServerless Inventory Manager\nGCP, Node.js, MongoDB Jan 2026 - Present\nBuilt a serverless inventory tracking system on Google Cloud Platform using Cloud Run and Cloud Pub/Sub\nfor event-driven updates.\nIntegrated a MongoDB backend to store dynamic product schemas, enabling flexible filtering for diverse retail\nitems.\nDevOps Automation Suite\nDocker, Jenkins, Bash May 2025 - Aug 2025\nCreated a centralized CI/CD pipeline in Jenkins that automates linting, unit testing, and Docker image de-\nployment to a private registry.\nDeveloped custom Bash scripts to monitor container health and automate rollbacks in staging environments.\nReal-time Collaborative Editor\nTypeScript, React, Socket.io Jun 2024 — Sept 2024\nArchitected a web-based document editor using React and Socket.i to support concurrent editing across mul-\ntiple sessions.\nUtilized TypeScript for robust type-safety and implemented a conflict resolution algorithm to handle simulta-\nneous data synchronization.\nTECHNICAL SKILLS\nProgramming: TypeScript, JavaScript (ES6+), Python, SQL, HTML/CSS\nFrameworks & Libraries: React, Node.js, Express, Redux, Mocha, Chai, Socket.io\nCloud & DevOps: Azure Functions, Google Cloud Platform (GCP), Docker, Jenkins, Firebase\nDatabases: PostgreSQL, MongoDB, Redis, MySQL\nDeployment & Optimization: CI/CD (Jenkins), REST APIs, JWT/OAuth2, Git, Jira\nEDUCATION\nUniversity of Washington Aug 2020 - May 2024\nBachelor of Science in Computer Science",
    "jobDescription": "Bramble Commerce — Full-Stack Software Development Engineer (SDE)\nLocation: Seattle, WA (Hybrid)\n\nAbout Bramble Commerce\nBramble Commerce builds the headless commerce APIs that power direct-to-consumer brands. We are a small, product-driven team in Seattle focused on giving developers clean primitives for catalog, cart, and checkout, so brands can ship storefronts in days instead of quarters.\n\nThe Role\nWe are looking for a Full-Stack Software Development Engineer to join our Core Experience team. In this role you own merchant-facing features end to end: designing responsive React UI, then architecting the event-driven services behind them on AWS. You will work in a high-growth environment where your code directly impacts thousands of transactions per second.\n\nResponsibilities\nFeature Ownership: Design, develop, and deploy end-to-end features for our merchant\ndashboard and checkout services.\nFront-End Excellence: Build and maintain scalable, high-performance web applications using React and TypeScript.\nBackend Architecture: Develop and optimize Node.js microservices and RESTful APIs that power our core order and inventory workflows.\nCloud Infrastructure: Leverage AWS native services including Lambda, API Gateway, DynamoDB, and S3 to build resilient, serverless architectures.\nSecurity & Auth: Implement and maintain secure authentication and authorization protocols using JWT and OAuth2.\nQuality Assurance: Write comprehensive unit, integration, and E2E tests using Jest and Cypress to ensure 99.9% system uptime.\nCollaboration: Participate in design reviews, sprint planning, and blameless post-mortems while mentoring junior engineers.\nOperational Excellence: Monitor production health using CloudWatch and Datadog; troubleshoot and resolve performance bottlenecks.\n\nRequired Qualifications\n2+ years of professional experience in full-stack software development. Strong proficiency in JavaScript and TypeScript.\nDirect production experience with React (Hooks, Context API, State Management).\nDeep understanding of Node.js and experience building scalable REST APIs.\nHands-on experience with AWS Serverless environments (specifically Lambda and DynamoDB).\nFamiliarity with containerization (Docker) and modern CI/CD tools like GitHub Actions.\nA solid grasp of CS fundamentals: data structures, algorithms, and system design.\nExcellent communication skills and a desire to work in a collaborative, hybrid environment."
  },
  {
    "analysisId": "c733fc46-4a94-463c-b53e-f0b977fa40c6",
    "status": "completed",
    "createdAt": "2026-07-12T16:12:27.880649+00:00",
    "fileName": "jordan_smith_resume.pdf",
    "jobTitle": "Full-Stack Software Development Engineer @ Marketgrid",
    "matchScore": 82,
    "matchedCount": 16,
    "totalCount": 23,
    "scoreSummary": "Strong technical and full-stack capability match with all core technologies present, but missing explicit evidence of system design expertise, scalability discussions, performance optimization methodology, and critical soft skills including mentoring and cross-functional collaboration.",
    "scoreSummaryShort": "Strong fullstack match — missing mentoring, system design, cross-functional collaboration",
    "scoreBreakdown": {
      "softSkills": 25,
      "technical": 93,
      "experience": 100,
      "tools": 86
    },
    "presentKeywords": [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "REST APIs",
      "AWS Lambda",
      "API Gateway",
      "DynamoDB",
      "S3",
      "JWT",
      "OAuth2",
      "Jest",
      "Cypress",
      "Docker",
      "GitHub Actions",
      "CloudWatch"
    ],
    "missingKeywords": [
      "System Design",
      "Scalability",
      "Performance Optimization",
      "Mentoring",
      "Code Review",
      "Cross-functional Collaboration",
      "Datadog"
    ],
    "topMissing": [
      {
        "keyword": "System Design",
        "importanceScore": 10,
        "reason": "Listed as a required qualification and directly underpins the role's responsibility to design and implement scalable backend services and REST APIs for a high-availability marketplace platform."
      },
      {
        "keyword": "Scalability",
        "importanceScore": 9,
        "reason": "Explicitly required in qualifications and central to Marketgrid's core value proposition of handling thousands of sellers with uptime and data correctness as the product."
      },
      {
        "keyword": "Performance Optimization",
        "importanceScore": 8,
        "reason": "Called out as a required qualification and directly tied to the role's responsibility of maintaining production health on a platform that thousands of merchants depend on daily."
      },
      {
        "keyword": "Datadog",
        "importanceScore": 7,
        "reason": "Explicitly named as a required observability tool in both the responsibilities and required qualifications sections, making it a concrete hard requirement for production monitoring."
      },
      {
        "keyword": "Mentoring",
        "importanceScore": 6,
        "reason": "Listed as a required qualification and a named responsibility, indicating the role expects demonstrated experience supporting junior engineers beyond just technical contributions."
      }
    ],
    "suggestions": [
      {
        "keyword": "System Design",
        "reason": "Resume demonstrates system design through serverless inventory sync and payment gateway projects, but does not explicitly use the term 'system design' or discuss architectural principles",
        "whereToAdd": "Add to technical skills section or highlight in project descriptions with explicit mention of design decisions and trade-offs"
      },
      {
        "keyword": "Scalability",
        "reason": "Resume shows scalable solutions (10k+ daily transactions, 5k+ users) but does not explicitly discuss scalability considerations or design patterns",
        "whereToAdd": "Quantify scalability achievements in experience bullets, e.g., 'designed services to handle 10k+ daily transactions with horizontal scaling'"
      },
      {
        "keyword": "Performance Optimization",
        "reason": "Resume includes performance improvements (15% bundle size reduction, 200ms latency reduction, 30-minute to 8-minute deployment) but lacks explicit mention of performance optimization methodology",
        "whereToAdd": "Add 'Performance Optimization' to technical skills; expand on optimization techniques used in experience bullets"
      },
      {
        "keyword": "Mentoring",
        "reason": "Job description requires mentoring experience; resume does not mention mentoring junior engineers or supporting team members",
        "whereToAdd": "Add mentoring experience to experience section or create a leadership/impact section if applicable"
      },
      {
        "keyword": "Code Review",
        "reason": "Job description mentions code review participation; resume does not explicitly reference code review experience",
        "whereToAdd": "Add code review responsibilities to current or past role descriptions"
      },
      {
        "keyword": "Cross-functional Collaboration",
        "reason": "Job description emphasizes partnership with product, design, and data teams; resume does not explicitly mention cross-functional collaboration",
        "whereToAdd": "Add collaboration examples in experience bullets, e.g., 'partnered with product and design teams to ship X feature'"
      },
      {
        "keyword": "Datadog",
        "reason": "Job description lists Datadog as required observability tool; resume only mentions CloudWatch",
        "whereToAdd": "If experienced with Datadog, add to technical skills; otherwise, note as learning opportunity"
      }
    ],
    "experienceCheck": {
      "requiredYears": "2+",
      "resumeStatedYears": null,
      "actualYears": "1.8",
      "displayYears": "2",
      "hasMismatch": false,
      "warning": null,
      "recommendation": null
    },
    "originalText": "Jordan Smith\nSeattle, WA 206-555-0199 I j.smith@email.com | linkedin.com/in/jsmith | github.com/jsmith-dev\nTechnical Skills\nLanguages: TypeScript, JavaScript (ES6+), SQL, HTML/CSS\nFrameworks: React, Node.js, Express, Next.js, Jest, Cypress\nCloud/DevOps: AWS (Lambda, API Gateway, DynamoDB, S3), Docker, GitHub Actions\nTools: REST APIs, JWT/OAuth2, Git, Postman, DynamoDB Streams\nExperience\nStellar Tech Solutions Seattle, WA\nSoftware Development Engineer June 2025 - Present\nEngineered modular React components for a high-traffic merchant dashboard, reducing bundle size by 15% using TypeScript.\nDeveloped Node.js microservices on AWS Lambda to handle asynchronous order processing for 10k+ daily transactions.\nOptimized DynamoDB query patterns, reducing API latency by 200ms for mission-critical user profile endpoints.\nSwiftCart Systems Remote\nJunior Full-Stack Developer September 2024 - June 2025\nBuilt and maintained REST APIs using Express.js to support mobile and web payment workflows.\nImplemented Cypress end-to-end testing suites for checkout flows, decreasing production bugs by 30%.\nIntegrated OAuth2 authentication flows and managed secure JWT session handling for 5k+ users.\nTechnical Projects\nServerless Inventory Sync | Node.js, AWS Lambda, S3, DynamoDB\nDesigned a real-time inventory synchronization engine that processes bulk CSV uploads via S3 triggers.\nUtilized DynamoDB Streams to push instant stock updates to frontend clients via WebSockets.\nNimbus-Ready Payment Gateway I React, TypeScript, Node.js, Stripe\nDeveloped a secure PCI-compliant payment portal using React and Stripe API for custom e-commerce checkouts.\nBuilt a comprehensive logging system with CloudWatch to monitor transaction success rates and API health.\nCI/CD Automation Pipeline I Docker, GitHub Actions, Jest\nArchitected a full CI/CD pipeline that containerizes Node.js services and runs automated Jest tests on every PR.\nReduced deployment cycle time from 30 minutes to 8 minutes using parallelized GitHub Actions jobs.\nEducation\nUniversity of Washington Seattle, WA\nBachelor of Science in Computer Science June 2024",
    "suggestedText": "Jordan Smith\nSeattle, WA 206-555-0199 I j.smith@email.com | linkedin.com/in/jsmith | github.com/jsmith-dev\nTechnical Skills\nLanguages: TypeScript, JavaScript (ES6+), SQL, HTML/CSS\nFrameworks: React, Node.js, Express, Next.js, Jest, Cypress\nCloud/DevOps: AWS (Lambda, API Gateway, DynamoDB, S3), Docker, GitHub Actions\nTools: REST APIs, JWT/OAuth2, Git, Postman, DynamoDB Streams\nExperience\nStellar Tech Solutions Seattle, WA\nSoftware Development Engineer June 2025 - Present\nEngineered modular React components for a high-traffic merchant dashboard, reducing bundle size by 15% using TypeScript.\nDeveloped Node.js microservices on AWS Lambda to handle asynchronous order processing for 10k+ daily transactions.\nOptimized DynamoDB query patterns, reducing API latency by 200ms for mission-critical user profile endpoints.\nSwiftCart Systems Remote\nJunior Full-Stack Developer September 2024 - June 2025\nBuilt and maintained REST APIs using Express.js to support mobile and web payment workflows.\nImplemented Cypress end-to-end testing suites for checkout flows, decreasing production bugs by 30%.\nIntegrated OAuth2 authentication flows and managed secure JWT session handling for 5k+ users.\nTechnical Projects\nServerless Inventory Sync | Node.js, AWS Lambda, S3, DynamoDB\nDesigned a real-time inventory synchronization engine that processes bulk CSV uploads via S3 triggers.\nUtilized DynamoDB Streams to push instant stock updates to frontend clients via WebSockets.\nNimbus-Ready Payment Gateway I React, TypeScript, Node.js, Stripe\nDeveloped a secure PCI-compliant payment portal using React and Stripe API for custom e-commerce checkouts.\nBuilt a comprehensive logging system with CloudWatch to monitor transaction success rates and API health.\nCI/CD Automation Pipeline I Docker, GitHub Actions, Jest\nArchitected a full CI/CD pipeline that containerizes Node.js services and runs automated Jest tests on every PR.\nReduced deployment cycle time from 30 minutes to 8 minutes using parallelized GitHub Actions jobs.\nEducation\nUniversity of Washington Seattle, WA\nBachelor of Science in Computer Science June 2024",
    "jobDescription": "Marketgrid — Full-Stack Software Development Engineer (SDE)\nLocation: Seattle, WA (Hybrid)\n\nAbout Marketgrid\nMarketgrid runs the marketplace infrastructure behind multi-vendor retail platforms. We handle catalog, orders, and payouts across thousands of sellers, where uptime and data correctness are the product. Engineering works close to product, design, and data to ship features that thousands of merchants depend on daily.\n\nAbout the Role\nWe are hiring a Full-Stack Software Development Engineer to build customer-facing web experiences and backend services for our marketplace platform. You will partner with product, design, and data teams to ship reliable features end to end.\n\nResponsibilities\nBuild and maintain web applications using React and TypeScript.\nDevelop backend APIs and services with Node.js.\nDesign and implement REST APIs for product, order, and user workflows.\nBuild cloud-native services on AWS using Lambda, API Gateway, DynamoDB, and S3.\nCreate secure authentication and authorization flows (JWT/OAuth2).\nWrite unit, integration, and end-to-end tests (Jest/Cypress).\nBuild CI/CD pipelines and participate in code reviews.\nMonitor production health and troubleshoot issues using CloudWatch and Datadog.\nMentor junior engineers and contribute to design reviews.\n\nRequired Qualifications\n2+ years of software engineering experience.\nStrong proficiency in JavaScript/TypeScript.\nProduction experience with React, Node.js, and REST APIs.\nExperience with AWS serverless services (Lambda, API Gateway, DynamoDB).\nFamiliarity with Docker and GitHub Actions (or equivalent CI/CD).\nUnderstanding of system design, scalability, and performance optimization.\nExperience with production monitoring and observability tooling (CloudWatch, Datadog).\nExperience mentoring or supporting junior engineers."
  },
  {
    "analysisId": "e8d0e310-c2a5-4b83-8618-4285dacf8a6e",
    "status": "completed",
    "createdAt": "2026-07-12T16:03:39.220940+00:00",
    "fileName": "alex_rivera_resume.pdf",
    "jobTitle": "Senior Machine Learning Researcher @ Perceptra Labs",
    "matchScore": 11,
    "matchedCount": 2,
    "totalCount": 28,
    "scoreSummary": "This candidate is a junior web developer with 2 years of experience in PHP/Java web development and IT support, with virtually no overlap to the senior machine learning researcher role requiring 8+ years of AI research, deep learning expertise, computer vision specialization, and academic publishing record.",
    "scoreSummaryShort": "Entry-level web dev — missing ML, CV, research, 6+ years experience",
    "scoreBreakdown": {
      "technical": 2,
      "experience": 0,
      "tools": 5,
      "softSkills": 0
    },
    "presentKeywords": [
      "C++",
      "Senior level"
    ],
    "missingKeywords": [
      "Deep Learning",
      "Computer Vision",
      "Video Segmentation",
      "Neural Networks",
      "Mathematical Modeling",
      "LLM Optimization",
      "Edge Computing",
      "Distributed Training",
      "Real-time Video Understanding",
      "Research Leadership",
      "Academic Publishing",
      "Problem Solving",
      "PyTorch",
      "TensorFlow",
      "Keras",
      "Google Cloud Platform",
      "Kubernetes",
      "Apache Spark",
      "Hadoop",
      "Go",
      "Rust",
      "C#",
      "CVPR publications",
      "NeurIPS publications",
      "ICML publications",
      "Model deployment experience"
    ],
    "topMissing": [
      {
        "keyword": "Deep Learning",
        "importanceScore": 10,
        "reason": "Deep Learning is a core hard requirement explicitly stated under education and experience, and it underpins virtually every responsibility in this role including architecture design, video segmentation, and LLM optimization."
      },
      {
        "keyword": "Computer Vision",
        "importanceScore": 10,
        "reason": "Computer Vision is embedded in the job title itself and is the primary technical domain of the role, making its absence from a candidate's resume a critical disqualifying gap."
      },
      {
        "keyword": "PyTorch",
        "importanceScore": 9,
        "reason": "PyTorch is listed as a hard framework requirement under Core Requirements and is the industry-standard tool for the neural network and model development work central to this position."
      },
      {
        "keyword": "Neural Networks",
        "importanceScore": 9,
        "reason": "Designing and implementing neural network architectures is explicitly a core technical responsibility repeated across multiple sections of the JD, making it a foundational hard skill for this role."
      },
      {
        "keyword": "Distributed Training",
        "importanceScore": 8,
        "reason": "Distributed training is directly tied to a key listed responsibility involving large-scale pipeline design with Apache Spark and Hadoop, and is essential for the foundation model work Perceptra Labs focuses on."
      }
    ],
    "suggestions": [
      {
        "keyword": "Deep Learning",
        "reason": "Resume shows no experience with neural networks, deep learning frameworks, or machine learning research. This is a core requirement for the role.",
        "whereToAdd": "Work experience or projects section with ML-focused work"
      },
      {
        "keyword": "Computer Vision",
        "reason": "No mention of image processing, video analysis, or computer vision projects. Essential for this video understanding role.",
        "whereToAdd": "Projects section with CV-related implementations"
      },
      {
        "keyword": "Academic Publishing",
        "reason": "Resume shows no research publications, conference submissions, or academic contributions. Required for senior researcher role.",
        "whereToAdd": "Publications section or research experience"
      }
    ],
    "experienceCheck": {
      "requiredYears": "8+",
      "resumeStatedYears": null,
      "actualYears": "1.7",
      "displayYears": "2",
      "hasMismatch": true,
      "warning": "Candidate has 2.0 years of experience, which is below the required minimum of 8.0 years.",
      "recommendation": "Consider highlighting relevant experience more clearly or targeting roles aligned with current experience level."
    },
    "originalText": "Alex Rivera\nalex.r@email.com 206-555-0988 Seattle, WA\nWeb Developer with professional experience specializing in PHP and Java environments. Proven track record of maintaining\nlegacy systems, building internal business tools, and managing SQL databases. Seeking to transition into high-scale product\nengineering.\nWORK EXPERIENCE\nWeb Developer Seattle, WA\nGreenLeaf Marketing Agency Jul 2025 - Present\nDeveloped and maintained client websites using PHP, HTML₅, and jQuery, ensuring cross-browser compati-\nbility.\nManaged content updates and custom plugin development for WordPress-based marketing sites.\nOptimized site assets and image compression to improve Google Lighthouse scores for local business clients.\nCoordinated with design teams to translate Figma wireframes into static CSS layouts.\nJunior IT Specialist Renton, WA\nValley Health Partners Oct 2024 - Jun 2025\nMaintained internal patient record databases using Java (Spring Boot) and MySQL, focusing on data entry\nstability.\nPerformed manual QA testing for internal administrative portals, documenting bugs in Excel for the senior IT\nteam.\nAssisted in the migration of on-premise file servers to Dropbox Business for decentralized clinic access.\nProvided technical support for internal staff regarding portal access and basic software troubleshooting.\nPROJECTS\nLocal Business Directory\nPHP, MySQL, Bootstrap Jan 2026 - Present\nBuilt a searchable directory for local contractors using a LAMP stack; implemented basic CRUD operations for\nuser listings.\nUtilized Bootstrap for a mobile-friendly frontend and stored user data in a structured MySQL database.\nEmployee Timesheet Tool\nJava, Swing Aug 2025 - Nov 2025\nDeveloped a desktop-based GUI application for employees to log hours and export data to CSV format.\nImplemented basic password protection and file-based data persistence.\nWeather Info Script\nPython, Open WeatherMap API Jun 2024 - Aug 2024\nCreated a Python script that fetches weather data and emails a daily summary to a list of subscribers using\nSMTP.\nManaged script execution via Cron jobs on a local Linux server.\nTECHNICAL SKILLS\nProgramming: PHP, Java, Python, C++, JavaScript (ES5), SQL\nFrameworks & Libraries: Laravel, jQuery, Spring Boot, Bootstrap, WordPress\nTools & Cloud: MySQL, Heroku, Apache, cPanel, FileZilla, Git, Microsoft Excel\nTesting: Manual QA, Bug Tracking, Documentation\nEDUCATION\nWestern Washington University 2020 - 2024\nBachelor of Science in Information Technology",
    "suggestedText": "Alex Rivera\nalex.r@email.com 206-555-0988 Seattle, WA\nWeb Developer with professional experience specializing in PHP and Java environments. Proven track record of maintaining\nlegacy systems, building internal business tools, and managing SQL databases. Seeking to transition into high-scale product\nengineering.\nWORK EXPERIENCE\nWeb Developer Seattle, WA\nGreenLeaf Marketing Agency Jul 2025 - Present\nDeveloped and maintained client websites using PHP, HTML₅, and jQuery, ensuring cross-browser compati-\nbility.\nManaged content updates and custom plugin development for WordPress-based marketing sites.\nOptimized site assets and image compression to improve Google Lighthouse scores for local business clients.\nCoordinated with design teams to translate Figma wireframes into static CSS layouts.\nJunior IT Specialist Renton, WA\nValley Health Partners Oct 2024 - Jun 2025\nMaintained internal patient record databases using Java (Spring Boot) and MySQL, focusing on data entry\nstability.\nPerformed manual QA testing for internal administrative portals, documenting bugs in Excel for the senior IT\nteam.\nAssisted in the migration of on-premise file servers to Dropbox Business for decentralized clinic access.\nProvided technical support for internal staff regarding portal access and basic software troubleshooting.\nPROJECTS\nLocal Business Directory\nPHP, MySQL, Bootstrap Jan 2026 - Present\nBuilt a searchable directory for local contractors using a LAMP stack; implemented basic CRUD operations for\nuser listings.\nUtilized Bootstrap for a mobile-friendly frontend and stored user data in a structured MySQL database.\nEmployee Timesheet Tool\nJava, Swing Aug 2025 - Nov 2025\nDeveloped a desktop-based GUI application for employees to log hours and export data to CSV format.\nImplemented basic password protection and file-based data persistence.\nWeather Info Script\nPython, Open WeatherMap API Jun 2024 - Aug 2024\nCreated a Python script that fetches weather data and emails a daily summary to a list of subscribers using\nSMTP.\nManaged script execution via Cron jobs on a local Linux server.\nTECHNICAL SKILLS\nProgramming: PHP, Java, Python, C++, JavaScript (ES5), SQL\nFrameworks & Libraries: Laravel, jQuery, Spring Boot, Bootstrap, WordPress\nTools & Cloud: MySQL, Heroku, Apache, cPanel, FileZilla, Git, Microsoft Excel\nTesting: Manual QA, Bug Tracking, Documentation\nEDUCATION\nWestern Washington University 2020 - 2024\nBachelor of Science in Information Technology",
    "jobDescription": "Perceptra Labs — Senior Machine Learning Researcher (Computer Vision)\nLocation: Remote / San Francisco, CA\nExperience Level: Senior (8+ years)\n\nAbout Perceptra Labs\nPerceptra Labs is a research-first lab building foundation models for real-time video understanding. Our team publishes at top venues and ships architectures that run on-device, from autonomous robotics to AR headsets.\n\nRole Summary\nWe are looking for a Senior Machine Learning Researcher to join our Core AI team. You will lead the development of novel deep learning architectures for real-time video segmentation. This role requires a heavy background in mathematical modeling and academic research, moving well beyond traditional web application maintenance.\n\nCore Requirements\nEducation: PhD in Computer Science, Mathematics, or a related field with a focus on Deep Learning.\nExperience: 8+ years of professional experience in AI research and model deployment.\nLanguages: Expert-level proficiency in Go, Rust, and C#.\nFrameworks: Deep expertise in PyTorch, TensorFlow, and Keras for building neural networks.\nCloud Architecture: Mastery of Google Cloud Platform (GCP) and Kubernetes (K8s) for large-scale model training.\n\nKey Responsibilities\nPublish original research in top-tier conferences like CVPR, NeurIPS, or ICML.\nOptimize Large Language Models (LLMs) for edge computing devices using low-level C++ optimizations.\nDesign and implement distributed training pipelines using Apache Spark and Hadoop."
  }
];

export const DEMO_ANALYSES_BY_ID: Record<string, Analysis> = Object.fromEntries(
  DEMO_ANALYSES.map((a) => [a.analysisId, a]),
);
