import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function DailyWeighInBanner() {
  const [checked, setChecked] = useState(false);
  const [loggedToday, setLoggedToday] = useState(true); // assume true until checked, avoids a flash
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getProgress()
      .then((entries) => {
        const today = entries.some((e) => e.type === "weight" && isToday(e.date));
        setLoggedToday(today);
      })
      .finally(() => setChecked(true));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      await api.addProgress({ type: "weight", value: Number(value), source: "manual" });
      setLoggedToday(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!checked || loggedToday) return null;

  return (
    <div className="card" style={{ borderColor: "rgba(42,120,214,0.35)", background: "rgba(42,120,214,0.05)" }}>
      <h2 style={{ marginTop: 0 }}>Good morning — what's today's weight?</h2>
      <p className="muted">
        A quick daily weigh-in keeps your trend chart meaningful. Same time each morning, ideally
        before eating, works best.
      </p>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, maxWidth: 140 }}>
          <label>Weight (kg)</label>
          <input
            type="number"
            step="0.1"
            min="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <button className="primary" type="submit" disabled={saving || !value}>
          {saving ? "Saving..." : "Log today's weight"}
        </button>
      </form>
      {error && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
