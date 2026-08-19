import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Persisted to disk (not just kept in memory) so a backend restart — a
// deploy, `node --watch` picking up a file save during development — doesn't
// force everyone to log back in. Same store.json-style file persistence as
// db.js, just for a much smaller, more frequently mutated dataset, so it
// uses plain sync fs calls rather than that module's async write queue.
//
// Cookie-based rather than a custom header: some protected routes are
// reached via full-page browser navigation, not fetch() — Google OAuth
// connect/callback, the data export link — and a custom header can only ever
// be attached to a fetch() call. A cookie is sent automatically by the
// browser on every request to this origin, navigation included, which is
// the only way those routes can be session-protected too.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const COOKIE_NAME = "weightcoach_session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same override as db.js — must point at the same persistent disk in
// production so sessions survive a restart alongside the rest of the data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function loadSessions() {
  try {
    if (!existsSync(SESSIONS_FILE)) return new Map();
    const raw = JSON.parse(readFileSync(SESSIONS_FILE, "utf-8"));
    const now = Date.now();
    return new Map(Object.entries(raw).filter(([, expiresAt]) => expiresAt > now));
  } catch {
    return new Map();
  }
}

const sessions = loadSessions(); // token -> expiresAt

function persist() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)));
  } catch (err) {
    console.error("Failed to persist sessions:", err);
  }
}

export function createSession() {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  persist();
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    persist();
    return false;
  }
  return true;
}

export function clearAllSessions() {
  sessions.clear();
  persist();
}

export function destroySession(token) {
  if (token) {
    sessions.delete(token);
    persist();
  }
}

// `secure` requires HTTPS — only turned on in production so local HTTP dev
// still works. `sameSite: "lax"` (not "strict") is required for the Google
// OAuth callback: that's a cross-site top-level navigation redirect back to
// us, and "strict" would drop the cookie on exactly that request.
export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function requireSession(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!isValidSession(token)) {
    return res.status(401).json({ error: "Your session has expired — please log in again." });
  }
  next();
}

// Ends just this one session/device — unlike clearAllSessions (used when the
// account's credentials are reset), "Lock now" shouldn't sign out every tab.
export function endCurrentSession(req, res) {
  destroySession(req.cookies?.[COOKIE_NAME]);
  clearSessionCookie(res);
}
