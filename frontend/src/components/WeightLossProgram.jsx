import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const DIFFICULTIES = [
  { id: "easy", label: "Easy", desc: "~0.25 kg/week — gentle and highly sustainable, minimal lifestyle disruption." },
  { id: "normal", label: "Normal", desc: "~0.5 kg/week — the standard recommended pace for most people." },
  { id: "hard", label: "Hard", desc: "~0.75 kg/week — faster, needs more discipline. Capped automatically if it'd push calories unsafely low." },
];

export default function WeightLossProgram({ profile }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("difficulty"); // 'difficulty' | 'days'
  const [difficulty, setDifficulty] = useState("normal");
  const [targetDays, setTargetDays] = useState("90");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getWeightLossProgram().then(setProgram).finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const p = await api.generateWeightLossProgram(
        mode === "difficulty" ? { difficulty } : { targetDays: Number(targetDays) }
      );
      setProgram(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading...</p></div>;

  if (!profile?.goalWeightKg) {
    return (
      <div className="card">
        <h2>Weight loss program</h2>
        <p>Set a goal weight in your profile first so a pace and calorie target can be calculated.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>Weight loss program</h2>
        <span className="eyebrow">Your multi-week roadmap</span>
        <p className="muted" style={{ marginTop: 6 }}>
          Choose how fast you want to go, or tell it how many days you're aiming for — either
          way, the calorie target and pace are calculated from your actual numbers (weight,
          height, age, gender, activity level), never below a safe daily minimum. For just
          today's meals and a light workout, see Today's plan below instead.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={mode === "difficulty" ? "primary" : "secondary"}
            onClick={() => setMode("difficulty")}
          >
            Pick a pace
          </button>
          <button className={mode === "days" ? "primary" : "secondary"} onClick={() => setMode("days")}>
            Target a timeframe
          </button>
        </div>

        {mode === "difficulty" ? (
          <div className="checkbox-grid" style={{ gridTemplateColumns: "1fr", gap: 10, marginBottom: 12 }}>
            {DIFFICULTIES.map((d) => (
              <label
                key={d.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  border: `1px solid ${difficulty === d.id ? "var(--series-1)" : "var(--gridline)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input type="radio" name="difficulty" checked={difficulty === d.id} onChange={() => setDifficulty(d.id)} />
                <span>
                  <strong>{d.label}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>{d.desc}</div>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="field" style={{ maxWidth: 220 }}>
            <label>I want to reach my goal weight in...</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min="7" value={targetDays} onChange={(e) => setTargetDays(e.target.value)} />
              <span className="muted">days</span>
            </div>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <button className="primary" onClick={generate} disabled={generating}>
          {generating ? "Building your program..." : program ? "Regenerate program" : "Build my program"}
        </button>
      </div>

      {program && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            Your program{" "}
            <span className="tag normal" style={{ textTransform: "capitalize" }}>{program.difficulty}</span>
          </h2>

          <div className="row">
            <div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{program.effectiveRateKgPerWeek} kg/wk</div>
              <div className="muted">pace</div>
            </div>
            <div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{program.dailyCalorieTarget} kcal</div>
              <div className="muted">daily target (~{program.dailyDeficit} kcal deficit)</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Estimated {program.estimatedWeeks} weeks (~{program.estimatedDays} days) to lose {program.totalToLoseKg} kg,
            at a maintenance level of ~{program.maintenanceCalories} kcal/day.
          </p>

          {program.paceAdjustedForSafety && (
            <div className="error-banner" style={{ background: "rgba(250,178,25,0.1)", borderColor: "rgba(250,178,25,0.4)", color: "#a06a00" }}>
              Pace adjusted for safety — {program.safetyNote}
            </div>
          )}
          {!program.paceAdjustedForSafety && program.safetyNote && <p className="muted">{program.safetyNote}</p>}

          <h3 style={{ marginBottom: 8 }}>7-day indoor exercise program (no equipment)</h3>
          {program.indoorExerciseProgram?.map((day, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--gridline)" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {day.day} {day.restDay && <span className="tag normal">Rest</span>}
                {!day.restDay && <span className="muted" style={{ fontWeight: 400 }}> — {day.focus}</span>}
              </p>
              {!day.restDay && (
                <ul className="list-plain">
                  {day.exercises?.map((ex, j) => (
                    <li key={j}>{ex.name} — {ex.durationOrReps}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {program.weeklyMilestones?.length > 0 && (
            <>
              <h3 style={{ marginBottom: 6 }}>Milestones along the way</h3>
              <ul className="list-plain">
                {program.weeklyMilestones.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}

          {program.encouragement && <p style={{ marginTop: 10 }}>{program.encouragement}</p>}

          <p className="disclaimer">
            Calorie targets and pacing are general-purpose estimates, not medical advice — check
            with a doctor before starting, especially with any existing health condition.
          </p>
        </div>
      )}
    </>
  );
}
