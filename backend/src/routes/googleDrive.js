import { Router } from "express";
import crypto from "crypto";
import { getStore, updateStore } from "../db.js";
import {
  isConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  ensureValidAccessToken,
  findBackupFile,
  downloadBackupFile,
  performGoogleDriveBackup,
} from "../googleDrive.js";
import { validateBackupPayload, applyImportedData } from "../backup.js";
import { requireSession } from "../session.js";
import { getFrontendUrl } from "../util.js";

const router = Router();
const FRONTEND_URL = getFrontendUrl();

let pendingState = null;

router.get("/status", requireSession, async (req, res) => {
  const store = await getStore();
  res.json({
    configured: isConfigured(),
    connected: Boolean(store.googleDrive?.connected),
    lastBackupAt: store.googleDrive?.lastBackupAt ?? null,
  });
});

// /callback (below) is the one route in this file left unprotected — it's
// reached via Google's redirect, not a direct logged-in action, and relies
// on its own CSRF `state` check instead.
router.get("/connect", requireSession, (req, res) => {
  if (!isConfigured()) {
    return res.status(501).json({
      error: "Google Drive isn't configured yet. Set GOOGLE_DRIVE_REDIRECT_URI (and the GOOGLE_FIT_CLIENT_ID/SECRET, shared with Google Fit) in backend/.env — see README.md.",
    });
  }
  pendingState = crypto.randomBytes(16).toString("hex");
  res.redirect(buildAuthUrl(pendingState));
});

router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`${FRONTEND_URL}/?googleDrive=error&reason=${encodeURIComponent(error)}`);
  if (!code || !state || state !== pendingState) {
    return res.redirect(`${FRONTEND_URL}/?googleDrive=error&reason=invalid_state`);
  }
  pendingState = null;

  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code);
    if (!refreshToken) {
      return res.redirect(`${FRONTEND_URL}/?googleDrive=error&reason=no_refresh_token`);
    }

    // Immediately check whether a backup already exists from a previous
    // device/connection under this Google account, so we don't create a
    // duplicate file on first sync.
    const existing = await findBackupFile(accessToken).catch(() => null);

    await updateStore((s) => {
      s.googleDrive = {
        connected: true,
        accessToken,
        refreshToken,
        expiresAt,
        fileId: existing?.id ?? null,
        lastBackupAt: null,
      };
    });
    res.redirect(`${FRONTEND_URL}/?googleDrive=connected`);
  } catch (err) {
    console.error(err);
    res.redirect(`${FRONTEND_URL}/?googleDrive=error&reason=${encodeURIComponent(err.message)}`);
  }
});

router.post("/backup", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.googleDrive?.connected) {
    return res.status(400).json({ error: "Google Drive is not connected." });
  }

  try {
    const result = await performGoogleDriveBackup(store, updateStore);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Backup to Google Drive failed: ${err.message}` });
  }
});

router.get("/restore-preview", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.googleDrive?.connected) {
    return res.status(400).json({ error: "Google Drive is not connected." });
  }
  try {
    const accessToken = await ensureValidAccessToken(store, updateStore);
    const fileId = store.googleDrive.fileId ?? (await findBackupFile(accessToken))?.id;
    if (!fileId) return res.status(404).json({ error: "No backup found on Google Drive yet." });
    const text = await downloadBackupFile(accessToken, fileId);
    const parsed = JSON.parse(text);
    res.json({ exportedAt: parsed.exportedAt ?? null });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Couldn't read the Drive backup: ${err.message}` });
  }
});

router.post("/restore", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.googleDrive?.connected) {
    return res.status(400).json({ error: "Google Drive is not connected." });
  }
  try {
    const accessToken = await ensureValidAccessToken(store, updateStore);
    const fileId = store.googleDrive.fileId ?? (await findBackupFile(accessToken))?.id;
    if (!fileId) return res.status(404).json({ error: "No backup found on Google Drive yet." });

    const text = await downloadBackupFile(accessToken, fileId);
    const parsed = JSON.parse(text);
    const validationError = validateBackupPayload(parsed);
    if (validationError) return res.status(400).json({ error: validationError });

    const updated = await updateStore((s) => {
      const driveState = { ...s.googleDrive };
      applyImportedData(s, parsed.data);
      s.googleDrive = driveState; // keep the live Drive connection through the restore
    });
    res.json({ ok: true, restoredFrom: parsed.exportedAt ?? null, profile: updated.profile });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Restore from Google Drive failed: ${err.message}` });
  }
});

router.post("/disconnect", requireSession, async (req, res) => {
  await updateStore((s) => {
    s.googleDrive = { connected: false, accessToken: null, refreshToken: null, expiresAt: null, fileId: null, lastBackupAt: null };
  });
  res.status(204).end();
});

export default router;
