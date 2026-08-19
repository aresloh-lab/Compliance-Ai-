import { Router } from "express";
import crypto from "crypto";
import { getStore, updateStore } from "../db.js";
import { isConfigured, buildAuthUrl, exchangeCodeForTokens, performGoogleFitSync } from "../googleFit.js";
import { requireSession } from "../session.js";
import { getFrontendUrl } from "../util.js";

const router = Router();
const FRONTEND_URL = getFrontendUrl();

// CSRF guard for the OAuth redirect — short-lived, single use, held in memory
// only (this is a local single-user app; a real multi-user deployment would
// need this scoped per session instead).
let pendingState = null;

router.get("/status", requireSession, async (req, res) => {
  const store = await getStore();
  res.json({
    configured: isConfigured(),
    connected: Boolean(store.googleFit?.connected),
    lastSyncedAt: store.googleFit?.lastSyncedAt ?? null,
  });
});

// requireSession works here even though this is a full-page navigation
// (window.location.href, not fetch) — the session cookie is attached to
// every request to this origin, navigations included. /callback below is
// the one exception: that's reached via Google's redirect, not directly by
// our own logged-in browser action, and has its own CSRF `state` check.
router.get("/connect", requireSession, (req, res) => {
  if (!isConfigured()) {
    return res.status(501).json({
      error: "Google Fit isn't configured yet. Set GOOGLE_FIT_CLIENT_ID, GOOGLE_FIT_CLIENT_SECRET, and GOOGLE_FIT_REDIRECT_URI in backend/.env — see README.md.",
    });
  }
  pendingState = crypto.randomBytes(16).toString("hex");
  res.redirect(buildAuthUrl(pendingState));
});

router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/?googleFit=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state || state !== pendingState) {
    return res.redirect(`${FRONTEND_URL}/?googleFit=error&reason=invalid_state`);
  }
  pendingState = null;

  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code);
    if (!refreshToken) {
      // Google only omits this if the app was already authorized without a
      // fresh consent prompt — shouldn't happen given prompt=consent, but
      // surface it clearly rather than silently storing a token we can't refresh.
      return res.redirect(`${FRONTEND_URL}/?googleFit=error&reason=no_refresh_token`);
    }
    await updateStore((s) => {
      s.googleFit = {
        connected: true,
        accessToken,
        refreshToken,
        expiresAt,
        lastSyncedAt: null,
        importedSessionIds: [],
      };
    });
    res.redirect(`${FRONTEND_URL}/?googleFit=connected`);
  } catch (err) {
    console.error(err);
    res.redirect(`${FRONTEND_URL}/?googleFit=error&reason=${encodeURIComponent(err.message)}`);
  }
});

router.post("/sync", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.googleFit?.connected) {
    return res.status(400).json({ error: "Google Fit is not connected." });
  }

  try {
    const result = await performGoogleFitSync(store, updateStore);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Google Fit sync failed: ${err.message}` });
  }
});

router.post("/disconnect", requireSession, async (req, res) => {
  await updateStore((s) => {
    s.googleFit = {
      connected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      lastSyncedAt: null,
      importedSessionIds: [],
    };
  });
  res.status(204).end();
});

export default router;
