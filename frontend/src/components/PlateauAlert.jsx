import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function PlateauAlert() {
  const [status, setStatus] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getPlateauStatus(), api.getAlternativePlan()])
      .then(([s, p]) => {
        setStatus(s);
        setPlan(p);
      })
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const p = await api.generateAlternativePlan();
      setPlan(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading || !status || status.status === "insufficient_data" || status.status === "on_track") {
    return null;
  }

  // status.status === "plateau"
  return (
    <div className="card" style={{ borderColor: "rgba(250,178,25,0.4)", background: "rgba(250,178,25,0.06)" }}>
      <h2 style={{ marginTop: 0 }}>Your weight hasn't moved much lately</h2>
      <p className="muted">
        Over the last {status.windowDays} days you've gone from {status.firstWeightKg} kg to{" "}
        {status.lastWeightKg} kg ({status.changeKg > 0 ? "+" : ""}
        {status.changeKg} kg). Plateaus are a completely normal part of weight change — they don't
        mean what you're doing isn't working. Want a fresh look at what might help?
      </p>

      {error && <div className="error-banner">{error}</div>}

      {!plan && (
        <button className="primary" onClick={generate} disabled={generating}>
          {generating ? "Analyzing your data..." : "Get an alternative approach"}
        </button>
      )}

      {plan && (
        <div style={{ marginTop: 8 }}>
          <p>{plan.diagnosis}</p>

          {plan.likelyFactors?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>What's likely contributing</h3>
              <ul className="list-plain">
                {plan.likelyFactors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}

          <h3 style={{ marginBottom: 6 }}>A different angle</h3>
          <ul className="list-plain">
            {plan.alternativeStrategy?.calorieAdjustment && <li>{plan.alternativeStrategy.calorieAdjustment}</li>}
            {plan.alternativeStrategy?.exerciseChange && <li>{plan.alternativeStrategy.exerciseChange}</li>}
            {plan.alternativeStrategy?.otherChanges?.map((c, i) => <li key={i}>{c}</li>)}
          </ul>

          <h3 style={{ marginBottom: 6 }}>Focus for the next two weeks</h3>
          <ul className="list-plain">
            {plan.twoWeekFocus?.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>

          {plan.whenToSeeADoctor && (
            <p className="disclaimer">{plan.whenToSeeADoctor}</p>
          )}

          <p style={{ marginTop: 10 }}>{plan.encouragement}</p>

          <button className="secondary" onClick={generate} disabled={generating}>
            {generating ? "Regenerating..." : "Regenerate with latest data"}
          </button>
        </div>
      )}
    </div>
  );
}
