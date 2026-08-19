import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function PlanView() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPlan().then(setPlan).finally(() => setInitialLoading(false));
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const p = await api.generatePlan();
      setPlan(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Today's plan</h2>
      <span className="eyebrow">One day at a time</span>
      <p className="muted" style={{ marginTop: 6 }}>
        A one-day meal and light-exercise plan built from your profile, using the balanced-plate
        model and adjusted for any health conditions you've reported. For a full multi-week
        roadmap with a pace and calorie target, see the Weight loss program above instead.
      </p>
      {initialLoading ? (
        <p className="muted">Loading...</p>
      ) : (
        <button className="primary" onClick={generate} disabled={loading}>
          {loading ? "Generating..." : plan ? "Regenerate plan" : "Generate today's plan"}
        </button>
      )}

      {!initialLoading && plan && !isToday(plan.generatedAt) && (
        <p className="muted" style={{ marginTop: 8 }}>
          This plan is from {new Date(plan.generatedAt).toLocaleDateString()} — hit Regenerate for a fresh one for today.
        </p>
      )}

      {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

      {plan && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontWeight: 600 }}>
            Estimated calorie target: ~{plan.estimatedCalorieTarget} kcal
          </p>

          {plan.meals?.map((meal, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <h3 style={{ marginBottom: 4, fontSize: "1rem" }}>{meal.name}</h3>
              <ul className="list-plain">
                {meal.items?.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
              {meal.portionNote && <p className="muted">{meal.portionNote}</p>}
            </div>
          ))}

          {plan.exercise && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 4, fontSize: "1rem" }}>Light exercise</h3>
              <p>{plan.exercise.summary}</p>
              <ul className="list-plain">
                {plan.exercise.steps?.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.conditionNotes?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 4, fontSize: "1rem" }}>Notes for your conditions</h3>
              <ul className="list-plain">
                {plan.conditionNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
