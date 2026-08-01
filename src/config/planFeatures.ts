// Plan feature bullets shown on both the in-app Pricing page and the landing
// pricing section (billing-on branch). Shared so the two surfaces can't drift.

export const FREE_PLAN_FEATURES = [
  '2 resume analyses per day',
  '1 behavioral interview per day (5 questions)',
  '5 most recent analyses in history',
  'Match score and missing keywords',
];

export const PRO_PLAN_FEATURES = [
  '10 resume analyses per day',
  '5 interviews per day (10 questions each)',
  'Behavioral AND technical interview modes',
  'Full history (up to 500 analyses)',
  'AI resume rewrite suggestions',
  'DOCX export with edit diff',
];

// Sprint reads as a delta over Pro Monthly, not a repeat of its list: the
// first row is the cumulative anchor (rendered bold by both surfaces) and the
// $9.99/mo line is the "Best value" proof. Pro Monthly keeps its full list
// because its rows are upgrades over Free (2→10/day), not repeats.
export const SPRINT_PLAN_FEATURES = [
  'Everything in Pro Monthly',
  '60 days of full Pro access',
  'One-time charge — no renewal, no card kept on file',
  'Works out to $9.99 a month, billed once',
];
