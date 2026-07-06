// Master visibility switch for ALL billing/paywall UI: the /pricing and
// /upgrade/* routes, every UpgradePrompt mount, the History/InterviewHistory
// free-cap notices, the Manage-subscription button, and the landing pricing
// section. Ships OFF (VITE_ENABLE_BILLING_UI=false) so merging to main does
// not expose billing to beta users; flip the env var at build time to launch.
// Frontend visibility only — backend enforcement is controlled separately by
// ENFORCEMENT_ENABLED on the Lambdas and is NOT affected by this flag.
export const BILLING_UI_ENABLED =
  import.meta.env.VITE_ENABLE_BILLING_UI === 'true';
