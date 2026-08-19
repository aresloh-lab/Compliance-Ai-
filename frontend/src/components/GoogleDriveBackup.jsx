import React, { useEffect, useState } from "react";
import { googleDriveApi } from "../api.js";

export default function GoogleDriveBackup() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [urlNote, setUrlNote] = useState(null);
  const [restorePreview, setRestorePreview] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("googleDrive");
    if (g === "connected") setUrlNote("Google Drive connected!");
    if (g === "error") setUrlNote(`Couldn't connect Google Drive (${params.get("reason") || "unknown error"}).`);
    if (g) {
      params.delete("googleDrive");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }

    googleDriveApi.getStatus().then(setStatus).finally(() => setLoading(false));
  }, []);

  async function backupNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await googleDriveApi.backupNow();
      setStatus((s) => ({ ...s, lastBackupAt: result.lastBackupAt }));
      setNotice("Backed up to Google Drive.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkRestore() {
    setBusy(true);
    setError(null);
    setRestorePreview(null);
    try {
      const preview = await googleDriveApi.restorePreview();
      setRestorePreview(preview);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    setBusy(true);
    setError(null);
    try {
      await googleDriveApi.restore();
      setNotice("Restored from Google Drive. Reload to see it everywhere.");
      setRestorePreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await googleDriveApi.disconnect();
      setStatus(await googleDriveApi.getStatus());
      setRestorePreview(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !status) return null;

  return (
    <div className="card">
      <h2>Google Drive sync</h2>
      <p className="muted">
        Back up automatically to a private file in your Google Drive (visible only to this app,
        not your whole Drive) and restore it on a new phone by signing into the same Google
        account — no manual file juggling needed.
      </p>

      {urlNote && <p className="muted">{urlNote}</p>}
      {notice && <p className="muted">{notice}</p>}
      {error && <div className="error-banner">{error}</div>}

      {!status.configured && (
        <p className="muted">
          Not set up yet — needs a Google Cloud OAuth client configured in the backend's
          <code> .env</code> (see README.md → "Google Drive setup").
        </p>
      )}

      {status.configured && !status.connected && (
        <button className="primary" onClick={googleDriveApi.connect}>Connect Google Drive</button>
      )}

      {status.configured && status.connected && (
        <>
          <p>
            <span className="tag normal">Connected</span>{" "}
            <span className="muted">
              {status.lastBackupAt ? `Last backup ${new Date(status.lastBackupAt).toLocaleString()}` : "No backup yet"}
            </span>
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary" onClick={backupNow} disabled={busy}>
              {busy ? "Working..." : "Back up now"}
            </button>
            {!restorePreview && (
              <button className="secondary" onClick={checkRestore} disabled={busy}>Restore from Drive</button>
            )}
            <button className="secondary" onClick={disconnect} disabled={busy}>Disconnect</button>
          </div>

          {restorePreview && (
            <div
              className="error-banner"
              style={{ background: "rgba(250,178,25,0.1)", borderColor: "rgba(250,178,25,0.4)", color: "#a06a00", marginTop: 10 }}
            >
              This will replace <strong>all</strong> data currently on this device with the Drive
              backup{restorePreview.exportedAt && ` from ${new Date(restorePreview.exportedAt).toLocaleString()}`}.
              This can't be undone. Continue?
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="primary" onClick={confirmRestore} disabled={busy}>
                  {busy ? "Restoring..." : "Yes, restore this backup"}
                </button>
                <button className="secondary" onClick={() => setRestorePreview(null)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
