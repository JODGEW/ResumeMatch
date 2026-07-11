import type { Analysis } from './index';

/**
 * Powers the signed-out `/sample` demo report at resumematchapp.com/sample.
 *
 * PROVENANCE — do not hand-edit this object.
 * Exported verbatim from a real production run (analysisId 25535b87-…, 2026-07-11,
 * cacheSource "miss") made AFTER the Pass 3 honesty guard and the keyword-validation fix
 * shipped. Every number and string below is genuine model output. The candidate, Jordan
 * Reyes, is a fully fictional persona (555 number, example.com email) written for this
 * purpose, so there is no real personal data here.
 *
 * Fields are WHITELISTED to the `Analysis` type. That is deliberate, not incidental: it
 * drops tokenUsage (which carries per-analysis cost — do not publish), s3Key, userId, and
 * the cache fields, without anyone having to remember to blacklist them one by one. String
 * numbers from the DynamoDB record are coerced to the types `Analysis` declares.
 *
 * The rewrite contains exactly ONE edit — "firewalls" inserted beside "security groups",
 * which are the same thing in AWS. That is the guard working: it refuses to insert Ansible,
 * Prometheus, Grafana or anything else the resume never evidences. A sparse diff is the
 * honest result, not a broken one.
 *
 * To refresh: rerun the pair in production, confirm cacheSource is "miss", and re-derive
 * from the browser network tab.
 */
export const SAMPLE_ANALYSIS: Analysis = {
  analysisId: 'sample',
  status: 'completed',
  createdAt: '2026-07-11T11:40:13.462Z',

  fileName: 'sample_resume_jordan_reyes.pdf',
  jobTitle: 'Platform & Infrastructure Engineer @ Northwind Media',

  matchScore: 82,
  matchedCount: 25,
  totalCount: 36,
  scoreSummary:
    'Strong infrastructure and platform engineering background with 4.5 years of relevant experience, excellent AWS and Kubernetes expertise, and demonstrated soft skills; primary gaps are lack of on-premises infrastructure exposure, Ansible experience, and specific networking technologies like VLANs and firewalls.',
  scoreSummaryShort: 'Strong cloud platform match — missing on-prem, Ansible, VLANs',
  scoreBreakdown: {
    technical: 85,
    tools: 75,
    softSkills: 95,
    experience: 90,
  },

  presentKeywords: [
    'Linux system administration',
    'Bash scripting',
    'Python scripting',
    'Infrastructure as Code',
    'Terraform',
    'AWS',
    'EC2',
    'VPC',
    'IAM',
    'S3',
    'Kubernetes',
    'CI/CD',
    'Networking',
    'DNS',
    'RBAC',
    'OS patching',
    'EKS',
    'Problem-solving',
    'Communication',
    'Documentation',
    'On-call support',
    'Mentorship receptiveness',
    'End-to-end ownership',
    'Datadog',
    'AWS certification',
  ],
  missingKeywords: [
    'Ansible',
    'VLANs',
    'Firewalls',
    'Bare metal provisioning',
    'Prometheus',
    'Grafana',
    'ELK',
    'Salt configuration management',
    'Data center experience',
    'Homelab experience',
    'On-premises environment experience',
  ],

  topMissing: [
    {
      keyword: 'Ansible',
      importanceScore: 10,
      reason:
        'Ansible is explicitly named as a preferred IaC tool in the hard requirements and appears multiple times across both the responsibilities and requirements sections, making it a core technical expectation for this role.',
    },
    {
      keyword: 'Bare metal provisioning',
      importanceScore: 9,
      reason:
        "Bare metal server provisioning is called out repeatedly as a primary hands-on responsibility unique to this hybrid infrastructure role and directly reflects Northwind Media's on-premises data center environment.",
    },
    {
      keyword: 'Firewalls',
      importanceScore: 8,
      reason:
        'Firewall rule maintenance is listed as a required day-to-day network operations task under the responsibilities section and falls within the basic networking understanding hard requirement.',
    },
    {
      keyword: 'VLANs',
      importanceScore: 7,
      reason:
        'VLANs appear in both the responsibilities and hard requirements sections as a networking fundamental the candidate is expected to support, reflecting the on-premises and hybrid network operations focus of the role.',
    },
    {
      keyword: 'Prometheus',
      importanceScore: 4,
      reason:
        'Prometheus is listed as a nice-to-have observability tool and aligns with the responsibility to contribute to monitoring dashboards and alert configuration across hybrid environments, giving it practical relevance despite its lower priority classification.',
    },
  ],

  suggestions: [
    {
      keyword: 'Ansible',
      reason:
        'Job description emphasizes Ansible as preferred IaC tool alongside Terraform; resume shows only Terraform experience',
      whereToAdd:
        'Add Ansible experience to Skills section or highlight any configuration management exposure in experience descriptions',
    },
    {
      keyword: 'On-premises environment experience',
      reason:
        'Role requires hands-on on-prem infrastructure work; resume is AWS-focused with no mention of data center or on-prem systems',
      whereToAdd:
        'Highlight any homelab projects, previous data center work, or on-prem infrastructure exposure in a new bullet or cover letter',
    },
    {
      keyword: 'VLANs',
      reason:
        'Job requires VLAN maintenance and troubleshooting; resume mentions VPCs and security groups but not VLANs',
      whereToAdd:
        'Add VLAN experience if available, or note network segmentation work in existing networking bullets',
    },
    {
      keyword: 'Firewalls',
      reason:
        'Job requires firewall rule maintenance; resume does not explicitly mention firewall configuration or management',
      whereToAdd:
        'Add firewall experience to networking troubleshooting bullets or clarify security group/firewall work in existing descriptions',
    },
    {
      keyword: 'Bare metal provisioning',
      reason:
        'Core responsibility in job description; resume shows only cloud infrastructure provisioning',
      whereToAdd:
        'Highlight any bare metal server provisioning, OS deployment, or physical infrastructure experience if available',
    },
    {
      keyword: 'Prometheus',
      reason:
        'Listed as nice-to-have observability tool; resume mentions Datadog but not Prometheus',
      whereToAdd:
        'Add Prometheus experience if available, or note in cover letter any exposure to open-source monitoring tools',
    },
    {
      keyword: 'Grafana',
      reason:
        'Listed as nice-to-have observability tool; resume mentions Datadog dashboards but not Grafana',
      whereToAdd:
        'Add Grafana experience if available, or highlight dashboard/visualization work with other tools',
    },
  ],

  experienceCheck: {
    requiredYears: '3-5',
    resumeStatedYears: '4',
    actualYears: '4.1',
    displayYears: '4.5',
    hasMismatch: false,
    warning: null,
    recommendation: null,
  },

  originalText:
    'Jordan Reyes\nDenver, CO I jordan.reyes@example.com I (555) 014-2261\nPlatform engineer with 4 years building and operating AWS infrastructure, Kubernetes clusters, and CI/CD pipelines\nfor high-traffic production services.\nEXPERIENCE\nPlatform Engineer I Harborline Logistics I Denver, CO I Aug 2024 - Present\nManage AWS infrastructure (EC2, VPC, IAM, S3, RDS) with Terraform across three environments, maintaining\nabout 40 reusable modules and cutting new environment build time from 2 days to 3 hours.\nOperate two production EKS clusters running about 60 services: deployments, autoscaling, resource limits, and\ntroubleshooting support for application teams.\nMaintain GitHub Actions CI/CD pipelines for 25+ repositories; standardized build templates cut pipeline failures by\nroughly 30%.\nBuild Datadog dashboards and alerts for infrastructure and application metrics; retuned alert thresholds to reduce\nnoisy pages by 40%.\nServe in the weekly on-call rotation and maintain runbooks for the 15 most common incident types.\nSystems Engineer I Bluepine Health Systems I Denver, CO I Jun 2022 - Aug 2024\nAdministered about 120 Linux servers (Ubuntu, Amazon Linux): OS patching, user and access management, file\nsystem and process troubleshooting.\nWrote Python and Bash automation for server provisioning, backup verification, and certificate renewal, saving\nabout 10 hours of manual work per week.\nTroubleshot connectivity issues across VPCs and office networks: DNS, routing, security groups, and load\nbalancer configuration.\nContainerized 12 legacy services with Docker and moved them onto Kubernetes with zero-downtime cutovers.\nImplemented least-privilege IAM roles and policies for eight product teams and supported the company SSO\nrollout.\nSKILLS\nCloud: AWS (EC2, VPC, IAM, S3, EKS, RDS, CloudWatch), Docker, Kubernetes\nlaC and Automation: Terraform, Python, Bash, Git, GitHub Actions\nOperations: Linux (Ubuntu, RHEL), Datadog, PagerDuty, incident response, runbooks, CI/CD\nEDUCATION AND CERTIFICATION\nB.S. Computer Science, University of Colorado Boulder, 2022\nAWS Certified Solutions Architect - Associate, 2024',

  // The ONLY difference from originalText: "firewalls" added beside "security groups".
  suggestedText:
    'Jordan Reyes\nDenver, CO I jordan.reyes@example.com I (555) 014-2261\nPlatform engineer with 4 years building and operating AWS infrastructure, Kubernetes clusters, and CI/CD pipelines\nfor high-traffic production services.\nEXPERIENCE\nPlatform Engineer I Harborline Logistics I Denver, CO I Aug 2024 - Present\nManage AWS infrastructure (EC2, VPC, IAM, S3, RDS) with Terraform across three environments, maintaining\nabout 40 reusable modules and cutting new environment build time from 2 days to 3 hours.\nOperate two production EKS clusters running about 60 services: deployments, autoscaling, resource limits, and\ntroubleshooting support for application teams.\nMaintain GitHub Actions CI/CD pipelines for 25+ repositories; standardized build templates cut pipeline failures by\nroughly 30%.\nBuild Datadog dashboards and alerts for infrastructure and application metrics; retuned alert thresholds to reduce\nnoisy pages by 40%.\nServe in the weekly on-call rotation and maintain runbooks for the 15 most common incident types.\nSystems Engineer I Bluepine Health Systems I Denver, CO I Jun 2022 - Aug 2024\nAdministered about 120 Linux servers (Ubuntu, Amazon Linux): OS patching, user and access management, file\nsystem and process troubleshooting.\nWrote Python and Bash automation for server provisioning, backup verification, and certificate renewal, saving\nabout 10 hours of manual work per week.\nTroubleshot connectivity issues across VPCs and office networks: DNS, routing, firewalls, security groups, and load balancer configuration.\nContainerized 12 legacy services with Docker and moved them onto Kubernetes with zero-downtime cutovers.\nImplemented least-privilege IAM roles and policies for eight product teams and supported the company SSO\nrollout.\nSKILLS\nCloud: AWS (EC2, VPC, IAM, S3, EKS, RDS, CloudWatch), Docker, Kubernetes\nlaC and Automation: Terraform, Python, Bash, Git, GitHub Actions\nOperations: Linux (Ubuntu, RHEL), Datadog, PagerDuty, incident response, runbooks, CI/CD\nEDUCATION AND CERTIFICATION\nB.S. Computer Science, University of Colorado Boulder, 2022\nAWS Certified Solutions Architect - Associate, 2024',

  jobDescription:
    'Platform & Infrastructure Engineer\nNorthwind Media | Denver, CO (on-site 4 days per week)\nFull time | $120,000 - $160,000 plus bonus\n\nAbout Northwind Media\nNorthwind Media builds the advertising platform behind several major streaming TV services. Our systems run across two data centers and AWS, and the infrastructure team keeps all of it fast and reliable.\n\nThe Role\nWe are hiring a platform engineer for our hybrid infrastructure team. You will work alongside senior engineers on both our on-premises environment and AWS: provisioning bare metal servers, maintaining network infrastructure, extending our Infrastructure as Code, and keeping production reliable. This is hands-on work from day one, with mentorship from engineers who have built these systems before. You should be able to own a task end to end, ask good questions, and be genuinely interested in learning physical infrastructure, not just managed cloud services.\n\nResponsibilities\n- Deploy and maintain on-premises compute, storage, and networking infrastructure alongside our AWS environment\n- Participate in bare metal server provisioning and OS deployment workflows\n- Support day-to-day network operations: troubleshoot connectivity issues and help maintain firewall rules, VLANs, and VPN configurations under senior guidance\n- Write and maintain Infrastructure as Code using Terraform and Ansible for both on-prem and cloud resources\n- Support CI/CD pipeline maintenance and help teams adopt existing platform tooling\n- Assist with Kubernetes cluster operations across bare metal and EKS environments: deployments, troubleshooting, resource management\n- Contribute automation scripts and tooling improvements in Python or Bash\n- Help maintain RBAC configurations, apply OS patches, and support access management processes\n- Participate in the on-call rotation with support from senior engineers; help investigate and resolve infrastructure incidents\n- Contribute to monitoring dashboards and alert configuration across hybrid environments\n- Keep runbooks and operational documentation current as you learn the systems\n\nRequirements\n- 3 to 5 years of experience in infrastructure, DevOps, platform engineering, systems administration, or a related role\n- Comfortable with Linux system administration: file systems, networking, process management, bash scripting\n- Hands-on experience with at least one Infrastructure as Code tool, Terraform or Ansible preferred\n- Working knowledge of AWS fundamentals: EC2, VPC, IAM, S3, and basic networking concepts\n- Basic networking understanding: IP addressing, DNS, VLANs, firewalls; you should be able to troubleshoot a connectivity issue\n- Experience with or exposure to Kubernetes: pods, deployments, and services\n- Scripting ability in Python or Bash for automation tasks\n\nNice to Have\n- Any exposure to physical infrastructure: data center work, a homelab, or on-prem environments in a professional setting\n- Familiarity with configuration management tools such as Ansible or Salt\n- An AWS certification at any level, or one in progress\n- Experience with observability tooling: Prometheus, Grafana, Datadog, or ELK',
};
