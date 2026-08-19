import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const CATEGORIES = [
  { id: "probiotic", label: "Probiotic / Yogurt" },
  { id: "vitaminC", label: "Vitamin C" },
  { id: "enzyme", label: "Digestive enzyme" },
  { id: "multivitamin", label: "Multivitamin" },
  { id: "fiber", label: "Fiber" },
  { id: "omega3", label: "Omega-3" },
  { id: "other", label: "Other" },
];

const QUICK_PICKS = [
  { category: "probiotic", name: "Plain yogurt" },
  { category: "vitaminC", name: "Vitamin C 500mg" },
  { category: "enzyme", name: "Digestive enzyme" },
  { category: "multivitamin", name: "Multivitamin" },
  { category: "fiber", name: "Psyllium fiber" },
  { category: "omega3", name: "Fish oil / Omega-3" },
];

function groupByDay(entries) {
  const groups = {};
  for (const e of entries) {
    const day = new Date(e.at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    (groups[day] = groups[day] || []).push(e);
  }
  return groups;
}

export default function SupplementLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("probiotic");
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getSupplements()
      .then((data) => setEntries([...data].reverse()))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("What did you take? e.g. Greek yogurt, Vitamin C 500mg.");
      return;
    }
    try {
      const entry = await api.addSupplement({ category, name: name.trim(), dosage: dosage.trim() });
      setEntries((es) => [entry, ...es]);
      setName("");
      setDosage("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api.deleteSupplement(id);
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.at).toDateString() === today).length;
  const groups = groupByDay(entries);
  const days = Object.keys(groups);

  return (
    <>
      <div className="card">
        <h2>Healthy additions</h2>
        <p className="muted">
          Track the extras that support digestion and nutrient gaps — probiotics/yogurt, vitamin
          C, digestive enzymes, fiber, and other supplements — alongside your meals.
        </p>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{todayCount}</div>
          <div className="muted">logged today</div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {QUICK_PICKS.map((p) => (
            <button
              type="button"
              key={p.name}
              className="secondary"
              style={{ padding: "3px 10px", fontSize: "0.78rem" }}
              onClick={() => {
                setCategory(p.category);
                setName(p.name);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="row">
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Dosage / amount (optional)</label>
              <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500mg, 1 cup" />
            </div>
          </div>
          <div className="field">
            <label>What did you take?</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greek yogurt" />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" type="submit">Log it</button>
        </form>
      </div>

      <div className="card">
        <h2>History</h2>
        {loading && <p className="muted">Loading...</p>}
        {!loading && days.length === 0 && <p className="muted">Nothing logged yet.</p>}
        {days.map((day) => (
          <div key={day} style={{ marginTop: 10 }}>
            <h3 style={{ marginBottom: 6, fontSize: "0.95rem" }}>{day}</h3>
            <ul className="progress-list">
              {groups[day].map((e) => (
                <li key={e.id}>
                  <span>
                    <span className="tag normal">{CATEGORIES.find((c) => c.id === e.category)?.label}</span>{" "}
                    {e.name}
                    {e.dosage && <span className="muted"> — {e.dosage}</span>}
                  </span>
                  <button onClick={() => remove(e.id)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
