// Google Drive backup sync — uses the `drive.file` scope, which only ever
// grants visibility into files this app itself created (or the user
// explicitly opened with it), never the user's whole Drive. That scope is
// tied to the OAuth client + Google account, not the device, so reconnecting
// on a new phone with the same Google account can still find a backup a
// previous device created — which is the whole point for "switching phones".

import { buildBackupPayload } from "./backup.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_DRIVE_FILENAME = "healthy-weight-coach-backup.json";

export function isConfigured() {
  return Boolean(process.env.GOOGLE_FIT_CLIENT_ID && process.env.GOOGLE_FIT_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI);
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_FIT_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
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
  if (!res.ok) throw new Error(data.error_description || data.error || "Google token request failed");
  return data;
}

export async function exchangeCodeForTokens(code) {
  const data = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_FIT_CLIENT_ID,
    client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
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
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function ensureValidAccessToken(store, updateStore) {
  const drive = store.googleDrive;
  if (!drive?.refreshToken) throw new Error("Google Drive is not connected.");
  if (drive.accessToken && drive.expiresAt && drive.expiresAt - Date.now() > 60_000) {
    return drive.accessToken;
  }
  const { accessToken, expiresAt } = await refreshAccessToken(drive.refreshToken);
  await updateStore((s) => {
    s.googleDrive.accessToken = accessToken;
    s.googleDrive.expiresAt = expiresAt;
  });
  return accessToken;
}

// Finds the app's backup file by name — works even on a fresh device with no
// locally-remembered fileId, since `drive.file` visibility follows the
// (app, Google account) pair, not the device.
export async function findBackupFile(accessToken) {
  const q = encodeURIComponent(`name = '${BACKUP_DRIVE_FILENAME}' and trashed = false`);
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Google Drive search failed");
  return data.files?.[0] ?? null;
}

export async function uploadNewBackupFile(accessToken, jsonContent) {
  const boundary = "backup" + Date.now();
  const metadata = { name: BACKUP_DRIVE_FILENAME, mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonContent}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Google Drive upload failed");
  return data.id;
}

export async function updateBackupFile(accessToken, fileId, jsonContent) {
  const res = await fetch(`${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: jsonContent,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "Google Drive update failed");
  }
}

export async function downloadBackupFile(accessToken, fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "Google Drive download failed");
  }
  return res.text();
}

// Shared by the /backup route and the "back up to Drive" chat tool.
export async function performGoogleDriveBackup(store, updateStore) {
  const accessToken = await ensureValidAccessToken(store, updateStore);
  const payload = buildBackupPayload(store);
  const jsonContent = JSON.stringify(payload, null, 2);

  let fileId = store.googleDrive.fileId;
  if (!fileId) {
    const existing = await findBackupFile(accessToken);
    fileId = existing?.id ?? null;
  }

  if (fileId) {
    await updateBackupFile(accessToken, fileId, jsonContent);
  } else {
    fileId = await uploadNewBackupFile(accessToken, jsonContent);
  }

  const updated = await updateStore((s) => {
    s.googleDrive.fileId = fileId;
    s.googleDrive.lastBackupAt = new Date().toISOString();
  });
  return { lastBackupAt: updated.googleDrive.lastBackupAt };
}
