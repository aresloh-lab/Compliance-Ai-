import React, { useEffect, useState } from "react";
import { companionApi } from "../api.js";

function companionLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("companion", "1");
  url.searchParams.set("code", code);
  return url.toString();
}

export default function CompanionShare() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [partnerLabel, setPartnerLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    companionApi
      .getStatus()
      .then((s) => {
        setStatus(s);
        setPartnerLabel(s.partnerLabel || "");
      })
      .finally(() => setLoading(false));
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const s = await companionApi.enable(partnerLabel);
      setStatus((prev) => ({ ...prev, ...s }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!confirm("This will invalidate the current code — your partner will need the new one to keep access. Continue?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await companionApi.regenerate();
      setStatus((prev) => ({ ...prev, ...s }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!confirm("Turn off sharing? Your partner will immediately lose access.")) return;
    setBusy(true);
    setError(null);
    try {
      await companionApi.disable();
      setStatus((prev) => ({ ...prev, enabled: false, code: null }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel() {
    setBusy(true);
    try {
      await companionApi.setLabel(partnerLabel);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(companionLink(status.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — copy the link text manually.");
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading...</p></div>;

  return (
    <div className="card">
      <h2>Share with your partner</h2>
      <p className="muted">
        Give your wife, girlfriend, or partner a code so they can see today's plan — your calorie
        allowance, water and step goals, and what you've eaten so far — and log a photo when you
        eat together, instead of you having to do it separately.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {!status?.enabled ? (
        <>
          <div className="field">
            <label>Their name (optional, just for your reference)</label>
            <input
              placeholder="e.g. Sarah"
              value={partnerLabel}
              onChange={(e) => setPartnerLabel(e.target.value)}
            />
          </div>
          <button className="primary" onClick={enable} disabled={busy}>
            {busy ? "Generating..." : "Generate a share code"}
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              marginTop: 8,
              padding: 14,
              background: "var(--page)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <p className="muted" style={{ margin: 0 }}>Share code</p>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: 2, margin: "4px 0" }}>
              {status.code}
            </p>
            <button className="secondary" onClick={copyLink} style={{ marginTop: 4 }}>
              {copied ? "Link copied!" : "Copy shareable link"}
            </button>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Their name (optional)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={partnerLabel} onChange={(e) => setPartnerLabel(e.target.value)} />
              <button className="secondary" onClick={saveLabel} disabled={busy}>Save</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="secondary" onClick={regenerate} disabled={busy}>Regenerate code</button>
            <button
              onClick={disable}
              disabled={busy}
              style={{ background: "none", border: "none", color: "var(--critical)", cursor: "pointer" }}
            >
              Turn off sharing
            </button>
          </div>

          <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
            Anyone with this code or link can view your daily plan and log shared meals — they
            can't see your chat, change your profile, or access anything else in the app.
            Regenerate the code any time to revoke access.
          </p>
        </>
      )}
    </div>
  );
}
