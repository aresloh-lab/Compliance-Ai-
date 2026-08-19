import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { aiApi } from "../api.js";

export default function AIProviderSettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function load() {
    aiApi.getStatus().then(setStatus).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function choose(id) {
    if (busy || id === status?.active) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await aiApi.setProvider(id);
      setStatus(result);
      setNotice(`Switched to ${result.providers.find((p) => p.id === id)?.label}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="card">
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles size={18} strokeWidth={2.25} /> AI Provider
      </h2>
      <p className="muted">
        Which AI model powers Coach chat, meal/health-report analysis, and every generated plan.
        Only one runs at a time. Add API keys in <code>backend/.env</code> to unlock more options.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <p className="muted">{notice}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {status.providers.map((p) => {
          const isActive = p.id === status.active;
          return (
            <button
              key={p.id}
              type="button"
              className={isActive ? "primary" : "secondary"}
              disabled={busy || !p.configured}
              onClick={() => choose(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                textAlign: "left",
                opacity: p.configured ? 1 : 0.5,
              }}
            >
              <span>{p.label}</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                {isActive ? "Active" : p.configured ? "Available" : "No API key set"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
