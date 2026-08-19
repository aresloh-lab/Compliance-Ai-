// The origin the frontend is served from — used for CORS, WebAuthn RP
// matching, and OAuth-callback redirects. Falls back to RENDER_EXTERNAL_URL
// (auto-populated by Render on every web service) so a Render deploy works
// without having to manually set FRONTEND_URL to a URL that isn't known
// until after the first deploy assigns it.
export function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173";
}

export function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model response");
  return JSON.parse(match[0]);
}

// Recognizes the AI-provider failure modes actually seen in practice (a 429
// rate-limit/quota response, or a "insufficient credits/billing" error) so
// the user gets an actionable hint instead of a bare "please try again" that
// will fail the exact same way on every retry until they actually do
// something about it (wait, add credits, or switch providers).
export function aiErrorHint(err) {
  const message = `${err?.message || ""}`.toLowerCase();
  const status = err?.status ?? err?.response?.status;
  if (status === 429 || message.includes("resource_exhausted") || message.includes("rate limit") || message.includes("quota")) {
    return " The active AI provider is rate-limited or has hit its usage quota right now — wait a bit, or switch providers under Profile > AI Provider.";
  }
  if (message.includes("credit balance") || message.includes("insufficient_quota") || (message.includes("billing") && status !== undefined)) {
    return " The active AI provider's account needs attention (billing/credits) — check its dashboard, or switch providers under Profile > AI Provider.";
  }
  return "";
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Whole years elapsed since a "YYYY-MM-DD" date of birth, as of today. Null
// for an unparseable date rather than throwing — callers decide how to
// handle that (e.g. profile.js rejects registration on a null result).
export function ageFromDob(dob) {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
