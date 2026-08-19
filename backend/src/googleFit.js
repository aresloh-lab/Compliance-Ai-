// Google Fit integration (Android only — HealthKit has no web-reachable API,
// so this is the one "phone built-in health monitoring" system a plain web
// backend can actually sync with, via OAuth + the Fitness REST API).
//
// Requires a Google Cloud project with the Fitness API enabled and an OAuth
// 2.0 Web application client. See README.md for the exact setup steps.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIT_API = "https://www.googleapis.com/fitness/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/fitness.activity.read";

export function isConfigured() {
  return Boolean(process.env.GOOGLE_FIT_CLIENT_ID && process.env.GOOGLE_FIT_CLIENT_SECRET && process.env.GOOGLE_FIT_REDIRECT_URI);
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_FIT_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_FIT_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces refresh_token on every connect, not just the first
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Google token request failed");
  }
  return data;
}

export async function exchangeCodeForTokens(code) {
  const data = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_FIT_CLIENT_ID,
    client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_FIT_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // only present when prompt=consent + access_type=offline
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(refreshToken) {
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_FIT_CLIENT_ID,
    client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// Aggregate API: daily step totals over [startMillis, endMillis).
export async function fetchDailySteps(accessToken, startMillis, endMillis) {
  const res = await fetch(`${FIT_API}/dataset:aggregate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
      bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
      startTimeMillis: String(startMillis),
      endTimeMillis: String(endMillis),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Google Fit steps request failed");

  return (data.bucket || []).map((bucket) => {
    const steps = (bucket.dataset || [])
      .flatMap((ds) => ds.point || [])
      .flatMap((p) => p.value || [])
      .reduce((sum, v) => sum + (v.intVal || 0), 0);
    const date = new Date(Number(bucket.startTimeMillis)).toISOString().slice(0, 10);
    return { date, steps };
  });
}

// Sessions API: actual workouts/activities (walking, running, cycling, etc.),
// excluding "still"/unknown activity type 0-4 which aren't real exercise.
const NON_ACTIVITY_TYPES = new Set([0, 1, 2, 3, 4, 5]); // still, tilting, unknown variants
const ACTIVITY_TYPE_NAMES = {
  7: "Walking",
  8: "Running",
  1: "Biking",
  9: "Aerobics",
  10: "Badminton",
  11: "Baseball",
  12: "Basketball",
  17: "Dancing",
  53: "Swimming",
  82: "Yoga",
  108: "Strength training",
};

export async function fetchActivitySessions(accessToken, startMillis, endMillis) {
  const params = new URLSearchParams({
    startTime: new Date(startMillis).toISOString(),
    endTime: new Date(endMillis).toISOString(),
  });
  const res = await fetch(`${FIT_API}/sessions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Google Fit sessions request failed");

  return (data.session || [])
    .filter((s) => !NON_ACTIVITY_TYPES.has(s.activityType))
    .map((s) => {
      const durationMinutes = Math.round((Number(s.endTimeMillis) - Number(s.startTimeMillis)) / 60000);
      return {
        externalId: s.id,
        at: new Date(Number(s.startTimeMillis)).toISOString(),
        activityType: s.name || ACTIVITY_TYPE_NAMES[s.activityType] || "Activity",
        durationMinutes: Math.max(durationMinutes, 1),
        intensity: "moderate",
        note: "Synced from Google Fit",
      };
    })
    .filter((s) => s.durationMinutes >= 3); // drop noise (brief auto-detected blips)
}

export async function ensureValidAccessToken(store, updateStore) {
  const fit = store.googleFit;
  if (!fit?.refreshToken) throw new Error("Google Fit is not connected.");
  if (fit.accessToken && fit.expiresAt && fit.expiresAt - Date.now() > 60_000) {
    return fit.accessToken;
  }
  const { accessToken, expiresAt } = await refreshAccessToken(fit.refreshToken);
  await updateStore((s) => {
    s.googleFit.accessToken = accessToken;
    s.googleFit.expiresAt = expiresAt;
  });
  return accessToken;
}

const SYNC_WINDOW_DAYS = 14;

// Shared by the /sync route and the "sync my Google Fit" chat tool, so both
// entry points do exactly the same import/merge logic.
export async function performGoogleFitSync(store, updateStore) {
  const accessToken = await ensureValidAccessToken(store, updateStore);
  const endMillis = Date.now();
  const startMillis = endMillis - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const [dailySteps, sessions] = await Promise.all([
    fetchDailySteps(accessToken, startMillis, endMillis),
    fetchActivitySessions(accessToken, startMillis, endMillis),
  ]);

  const result = { daysUpdated: 0, activitiesImported: 0 };

  const updated = await updateStore((s) => {
    for (const { date, steps } of dailySteps) {
      if (steps <= 0) continue;
      const existing = s.stepLog.find((e) => e.date === date);
      if (existing && existing.source === "manual") continue; // never clobber a manual entry
      if (existing) {
        existing.steps = steps;
        existing.at = new Date().toISOString();
      } else {
        s.stepLog.push({ id: Date.now() + Math.random(), date, steps, source: "google_fit", at: new Date().toISOString() });
      }
      result.daysUpdated += 1;
    }

    const seen = new Set(s.googleFit.importedSessionIds);
    for (const session of sessions) {
      if (seen.has(session.externalId)) continue;
      seen.add(session.externalId);
      s.activityLog.push({
        id: Date.now() + Math.random(),
        at: session.at,
        activityType: session.activityType,
        durationMinutes: session.durationMinutes,
        intensity: session.intensity,
        note: session.note,
        source: "google_fit",
      });
      result.activitiesImported += 1;
    }
    s.googleFit.importedSessionIds = [...seen];
    s.googleFit.lastSyncedAt = new Date().toISOString();
  });

  return { ...result, lastSyncedAt: updated.googleFit.lastSyncedAt };
}
