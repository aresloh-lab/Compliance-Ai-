// API client for the partner-facing companion view. Deliberately separate
// from api.js: the primary app is gated by the device app-lock, but this
// view is gated only by the share code, so it carries the code as a header
// on every request instead of relying on any session state.
const BASE = "/api/companion";
const CODE_KEY = "weightCoachCompanionCode";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function getSavedCode() {
  return localStorage.getItem(CODE_KEY);
}

export function saveCode(code) {
  localStorage.setItem(CODE_KEY, code);
}

export function clearCode() {
  localStorage.removeItem(CODE_KEY);
}

export const companionClient = {
  verify: (code) =>
    fetch(`${BASE}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then(handle),

  getSummary: () =>
    fetch(`${BASE}/summary`, { headers: { "X-Companion-Code": getSavedCode() || "" } }).then(handle),

  logMeal: ({ description, photo, mealType }) => {
    const form = new FormData();
    if (description) form.append("description", description);
    if (photo) form.append("photo", photo);
    form.append("mealType", mealType);
    return fetch(`${BASE}/meal`, {
      method: "POST",
      headers: { "X-Companion-Code": getSavedCode() || "" },
      body: form,
    }).then(handle);
  },
};
