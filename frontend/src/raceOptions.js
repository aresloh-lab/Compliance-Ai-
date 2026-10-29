// Shared by every race/ethnicity selector. Optional and never defaulted --
// this is sensitive personal data, so every selector's blank default option
// is labeled "Prefer not to say" (not just an empty placeholder the user has
// to notice they can leave), and that's the only place that label lives --
// not duplicated into this list. Used only to adjust weight-related
// health-risk guidance (see the WHO-threshold note on buildProfileSummary in
// backend/src/prompts.js), never for anything else.
export const RACE_OPTIONS = [
  "Asian",
  "Black / African",
  "White / Caucasian",
  "Hispanic / Latino",
  "Native Hawaiian or Pacific Islander",
  "American Indian or Alaska Native",
  "Middle Eastern / North African",
  "Mixed / multiple ethnicities",
  "Other",
];
