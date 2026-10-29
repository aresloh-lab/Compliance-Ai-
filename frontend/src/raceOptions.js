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

// Deliberately small. Each entry below mirrors that country's own official
// census/demographic classification (sourced from its national statistics
// office), not a guess -- it's only worth doing when there's a real,
// confidently-sourced answer, since getting this wrong is worse than the
// generic list above. Most countries don't classify residents by "race" at
// all (India's census doesn't; China's complex and sometimes
// politically fraught 56-ethnic-group system doesn't reduce sensibly to a
// short list) -- those are intentionally left out rather than forced into
// a Western race framework. Everything not listed here falls back to
// RACE_OPTIONS, which is itself not a value judgment about those countries,
// just the honest default.
export const COUNTRY_RACE_OPTIONS = {
  Malaysia: ["Malay", "Chinese", "Indian", "Other Bumiputera (indigenous)", "Other"],
  Singapore: ["Chinese", "Malay", "Indian", "Other"], // the official "CMIO" model
  "United Kingdom": [
    "White",
    "Asian or Asian British",
    "Black, African, Caribbean or Black British",
    "Mixed or multiple ethnic groups",
    "Other ethnic group",
  ],
};

export function getRaceOptionsForCountry(nationality) {
  return COUNTRY_RACE_OPTIONS[nationality] ?? RACE_OPTIONS;
}
