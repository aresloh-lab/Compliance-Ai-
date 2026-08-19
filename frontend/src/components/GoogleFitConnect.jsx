import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function GoogleFitConnect() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [urlNote, setUrlNote] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("googleFit");
    if (g === "connected") setUrlNote("Google Fit connected! Tap \"Sync now\" to pull in your data.");
    if (g === "error") setUrlNote(`Couldn't connect Google Fit (${params.get("reason") || "unknown error"}).`);
    if (g) {
      params.delete("googleFit");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }

    api.getGoogleFitStatus().then(setStatus).finally(() => setLoading(false));
  }, []);

  async function sync() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await api.syncGoogleFit();
      setSyncResult(result);
      const s = await api.getGoogleFitStatus();
      setStatus(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await api.disconnectGoogleFit();
    setStatus(await api.getGoogleFitStatus());
    setSyncResult(null);
  }

  if (loading) return null;

  return (
    <div className="card">
      <h2>Google Fit (Android)</h2>
      <p className="muted">
        Steps and workouts already tracked by your phone's Google Fit sync straight into your step
        log and activity log — no re-typing. iPhone can't connect here (Apple HealthKit has no web
        API); use the photo check-in below instead.
      </p>

      {urlNote && <p className="muted">{urlNote}</p>}
      {error && <div className="error-banner">{error}</div>}

      {!status.configured && (
        <p className="muted">
          Not set up yet — this needs a Google Cloud OAuth client configured in the backend's
          <code> .env</code> (see README.md → "Google Fit setup").
        </p>
      )}

      {status.configured && !status.connected && (
        <button className="primary" onClick={api.connectGoogleFit}>
          Connect Google Fit
        </button>
      )}

      {status.configured && status.connected && (
        <>
          <p>
            <span className="tag normal">Connected</span>{" "}
            <span className="muted">
              {status.lastSyncedAt
                ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
                : "Not synced yet"}
            </span>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" onClick={sync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            <button className="secondary" onClick={disconnect}>Disconnect</button>
          </div>
          {syncResult && (
            <p className="muted" style={{ marginTop: 8 }}>
              Updated {syncResult.daysUpdated} day{syncResult.daysUpdated === 1 ? "" : "s"} of steps,
              imported {syncResult.activitiesImported} new activit{syncResult.activitiesImported === 1 ? "y" : "ies"}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
