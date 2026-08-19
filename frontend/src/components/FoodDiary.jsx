import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const PACE_LABELS = { quick: "ate quickly", normal: "normal pace", slow: "ate slowly" };
const FULLNESS_LABELS = {
  stopped_satisfied: "stopped when satisfied",
  ate_until_full: "ate until full",
  ate_past_full: "ate past full",
};

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

export default function FoodDiary() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api
      .getFoodLog()
      .then((data) => setEntries([...data].reverse()))
      .finally(() => setLoading(false));
  }

  async function remove(id) {
    await api.deleteFoodLog(id);
    setEntries((e) => e.filter((x) => x.id !== id));
  }

  if (loading) return <div className="card"><p className="muted">Loading diary...</p></div>;

  const groups = groupByDay(entries);
  const days = Object.keys(groups);

  return (
    <div className="card">
      <h2>Food diary</h2>
      <p className="muted">
        Every meal you log from the Meal Analyzer shows up here, identified by the photo you took
        (when provided).
      </p>

      {days.length === 0 && (
        <p className="muted">No meals logged yet. Analyze a meal and tap "Log as..." to start your diary.</p>
      )}

      {days.map((day) => (
        <div key={day} style={{ marginTop: 14 }}>
          <h3 style={{ marginBottom: 8, fontSize: "0.95rem" }}>{day}</h3>
          {groups[day].map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "8px 0",
                borderBottom: "1px solid var(--gridline)",
              }}
            >
              {entry.photoDataUrl ? (
                <img
                  src={entry.photoDataUrl}
                  alt={entry.summary}
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: "var(--page)",
                    border: "1px solid var(--gridline)",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    <span className="tag normal">{MEAL_LABELS[entry.mealType]}</span>
                    <span className="muted" style={{ marginLeft: 6 }}>
                      {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <button
                    onClick={() => remove(entry.id)}
                    style={{ background: "none", border: "none", color: "var(--critical)", cursor: "pointer", fontSize: "0.78rem" }}
                  >
                    Remove
                  </button>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>{entry.summary}</p>
                {entry.calories != null && (
                  <p className="muted" style={{ margin: "2px 0 0" }}>~{entry.calories} kcal</p>
                )}
                {(entry.isJunkFood ||
                  entry.portionAssessment?.largerThanTypical ||
                  entry.eatingPace ||
                  entry.fullnessLevel ||
                  entry.loggedBy === "companion") && (
                  <p style={{ margin: "4px 0 0" }}>
                    {entry.loggedBy === "companion" && (
                      <span className="tag normal" style={{ marginRight: 4 }}>logged by your partner</span>
                    )}
                    {entry.isJunkFood && <span className="tag high" style={{ marginRight: 4 }}>junk food</span>}
                    {entry.portionAssessment?.largerThanTypical && (
                      <span className="tag borderline" style={{ marginRight: 4 }}>large portion</span>
                    )}
                    {entry.eatingPace === "quick" && (
                      <span className="tag borderline" style={{ marginRight: 4 }}>{PACE_LABELS.quick}</span>
                    )}
                    {entry.eatingPace && entry.eatingPace !== "quick" && (
                      <span className="tag normal" style={{ marginRight: 4 }}>{PACE_LABELS[entry.eatingPace]}</span>
                    )}
                    {entry.fullnessLevel === "ate_past_full" && (
                      <span className="tag borderline" style={{ marginRight: 4 }}>{FULLNESS_LABELS.ate_past_full}</span>
                    )}
                    {entry.fullnessLevel && entry.fullnessLevel !== "ate_past_full" && (
                      <span className="tag normal" style={{ marginRight: 4 }}>{FULLNESS_LABELS[entry.fullnessLevel]}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
