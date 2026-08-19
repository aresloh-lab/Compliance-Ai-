import React, { useEffect, useRef, useState } from "react";
import { Heart, Camera, Droplet, Footprints } from "lucide-react";
import { companionClient, getSavedCode, saveCode, clearCode } from "./companionClient.js";

const POLL_MS = 30000;
const MEAL_TYPES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
];

function inferMealType() {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

function CodeGate({ onVerified }) {
  const params = new URLSearchParams(window.location.search);
  const [code, setCode] = useState(params.get("code") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const triedAutoRef = useRef(false);

  async function submit(e) {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await companionClient.verify(code.trim());
      saveCode(code.trim());
      onVerified(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (params.get("code") && !triedAutoRef.current) {
      triedAutoRef.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 16px" }}>
      <div className="card">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Heart size={20} strokeWidth={2.25} color="var(--series-2)" /> You've been shared a plan
        </h2>
        <p className="muted">Enter the code your partner sent you to see today's plan and log meals together.</p>
        <form onSubmit={submit}>
          <div className="field">
            <input
              placeholder="AB3D-9FGH"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              style={{ textTransform: "uppercase", letterSpacing: 1 }}
            />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" type="submit" disabled={busy || !code.trim()}>
            {busy ? "Checking..." : "View plan"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Bar({ value, goal }) {
  const pct = goal ? Math.max(0, Math.min(100, Math.round((value / goal) * 100))) : 0;
  return (
    <div style={{ background: "var(--gridline)", borderRadius: 6, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, background: "var(--series-1)", height: "100%" }} />
    </div>
  );
}

function LogMealBox({ onLogged }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState(inferMealType());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    setPhoto(file || null);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit() {
    if (!description.trim() && !photo) {
      setError("Add a photo or a quick description of the meal.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { entry, analysis } = await companionClient.logMeal({
        description: description.trim(),
        photo,
        mealType,
      });
      setDone({ entry, analysis });
      onLogged?.(entry);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOpen(false);
    setPhoto(null);
    setPreview(null);
    setDescription("");
    setDone(null);
    setError(null);
  }

  if (!open) {
    return (
      <button className="primary" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setOpen(true)}>
        <Camera size={14} strokeWidth={2.25} /> Log a meal you shared together
      </button>
    );
  }

  if (done) {
    return (
      <div className="card">
        <p>
          <span className="tag normal">Logged as {mealType}</span>
          {done.analysis.containsJunkFood && <span className="tag high" style={{ marginLeft: 6 }}>junk food</span>}
        </p>
        <p className="muted">
          {done.analysis.items?.map((i) => i.name).join(", ")} — ~{done.analysis.totalCalories} kcal
        </p>
        <button className="secondary" onClick={reset}>Done</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Log a shared meal</h3>
      <div className="field">
        <label>Photo (optional)</label>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} />
        {preview && (
          <img src={preview} alt="" style={{ maxWidth: 180, marginTop: 8, borderRadius: 8, display: "block" }} />
        )}
      </div>
      <div className="field">
        <label>Description (optional if you added a photo)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>Meal type</label>
        <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
          {MEAL_TYPES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? "Analyzing..." : "Log it"}
        </button>
        <button className="secondary" onClick={reset} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function CompanionDashboard({ verified }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    companionClient
      .getSummary()
      .then(setSummary)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  function switchCode() {
    clearCode();
    window.location.search = "";
  }

  if (error) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: "0 16px" }}>
        <div className="error-banner">{error}</div>
        <button className="secondary" style={{ marginTop: 12 }} onClick={switchCode}>Use a different code</button>
      </div>
    );
  }

  if (!summary) return <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>Loading plan...</p>;

  const name = summary.name || verified.coachName || "Their";

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
      <h1 style={{ fontSize: "1.3rem" }}>{name}'s plan today</h1>
      <p className="muted" style={{ marginTop: -8 }}>Updates automatically every 30 seconds.</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Calories</h3>
        {summary.dailyCalorieTarget != null ? (
          <>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0" }}>
              {summary.caloriesRemainingToday} kcal left today
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {summary.caloriesConsumedToday} eaten of a {summary.dailyCalorieTarget} kcal goal
            </p>
            <div style={{ marginTop: 8 }}>
              <Bar value={summary.caloriesConsumedToday} goal={summary.dailyCalorieTarget} />
            </div>
          </>
        ) : (
          <p className="muted">No calorie target set yet — ask them to generate their weight-loss program.</p>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Water & steps</h3>
        <p style={{ margin: "4px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <Droplet size={14} strokeWidth={2.25} /> {summary.waterToday} / {summary.waterGoal} cups
        </p>
        <Bar value={summary.waterToday} goal={summary.waterGoal} />
        <p style={{ margin: "12px 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
          <Footprints size={14} strokeWidth={2.25} /> {summary.stepsToday} / {summary.stepGoal} steps
        </p>
        <Bar value={summary.stepsToday} goal={summary.stepGoal} />
      </div>

      {summary.program && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Goal</h3>
          <p className="muted" style={{ margin: 0 }}>
            Aiming to lose {summary.program.totalToLoseKg}kg at ~{summary.program.effectiveRateKgPerWeek}kg/week
            (about {summary.program.estimatedWeeks} weeks, {summary.program.difficulty} pace).
          </p>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Today's meals</h3>
        {summary.todaysMeals.length === 0 && <p className="muted">Nothing logged yet today.</p>}
        {summary.todaysMeals.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--gridline)" }}>
            {m.photoDataUrl ? (
              <img src={m.photoDataUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--page)" }} />
            )}
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>{m.summary}</p>
              <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                {m.mealType}{m.calories != null ? ` · ~${m.calories} kcal` : ""}
                {m.loggedBy === "companion" ? " · logged by you" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <LogMealBox onLogged={load} />
      </div>

      <p style={{ textAlign: "center", marginTop: 16 }}>
        <button
          onClick={switchCode}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem" }}
        >
          Not your plan? Use a different code
        </button>
      </p>
    </div>
  );
}

export default function CompanionApp() {
  const [verified, setVerified] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = getSavedCode();
    if (!saved) {
      setChecking(false);
      return;
    }
    companionClient
      .verify(saved)
      .then(setVerified)
      .catch(() => clearCode())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!verified) return <CodeGate onVerified={setVerified} />;
  return <CompanionDashboard verified={verified} />;
}
