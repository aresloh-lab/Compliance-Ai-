import React, { useEffect, useRef, useState } from "react";
import { PersonStanding, Send, Hash, Zap, Camera, Play, Square } from "lucide-react";
import { api } from "../api.js";
import GoogleFitConnect from "./GoogleFitConnect.jsx";
import DailyActivityCheckin from "./DailyActivityCheckin.jsx";
import RepCounter from "./RepCounter.jsx";
import TabataTimer from "./TabataTimer.jsx";
import VideoExerciseCoach from "./VideoExerciseCoach.jsx";

const INTENSITIES = [
  { id: "light", label: "Light" },
  { id: "moderate", label: "Moderate" },
  { id: "vigorous", label: "Vigorous" },
];

const ACTIVITY_QUICK_PICKS = [
  "Walking", "Basketball", "Swimming", "Cycling", "Gym workout", "Football",
  "Badminton", "Dancing", "Running", "Yoga", "Boxing",
];
const REP_QUICK_PICKS = ["Push-ups", "Squats", "Sit-ups", "Lunges", "Jumping jacks", "Burpees"];
const REP_EXERCISES = new Set([
  "push-ups", "squats", "sit-ups", "lunges", "jumping jacks",
  "burpees", "mountain climbers", "high knees", "calf raises", "glute bridges",
]);

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// The one entry point for anything active. A plain activity name (or
// duration) logs directly or starts a live timer, same as before. A
// countable-rep exercise (push-ups, squats, ...) is instead routed straight
// into the paced rep counter — and Tabata / camera-tracked reps are one tap
// away below — so RepCounter/TabataTimer/VideoExerciseCoach only appear once
// actually asked for, instead of all three sitting on the page permanently.
function ActivityBox({ onLogged, pendingWorkout, onStartReps, onStartTabata, onStartCamera }) {
  const [activityType, setActivityType] = useState("");
  const [intensity, setIntensity] = useState("moderate");
  const [duration, setDuration] = useState("30");
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const tickRef = useRef(null);
  const runningRef = useRef(false);
  const lastTokenRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(tickRef.current);
  }, [running, startedAt]);

  // Triggered by the coach ("I'm starting tabata now") via App.jsx. Guarded
  // by a token so re-renders with the same pendingWorkout don't restart it,
  // and skipped if a timer is already running so it can't clobber one in progress.
  useEffect(() => {
    if (!pendingWorkout || pendingWorkout.token === lastTokenRef.current) return;
    lastTokenRef.current = pendingWorkout.token;
    if (runningRef.current) return;
    startTimer(pendingWorkout.activityType, pendingWorkout.intensity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWorkout]);

  function reset() {
    setActivityType("");
    setNote("");
    setDuration("30");
  }

  function startTimer(overrideType, overrideIntensity) {
    const type = (overrideType ?? activityType).trim();
    if (!type) {
      setError("What are you starting? e.g. swimming, tabata.");
      return;
    }
    setActivityType(type);
    if (overrideIntensity) setIntensity(overrideIntensity);
    setError(null);
    setLastResult(null);
    setStartedAt(Date.now());
    setElapsedMs(0);
    setRunning(true);
    runningRef.current = true;
  }

  async function stopTimer() {
    setRunning(false);
    runningRef.current = false;
    clearInterval(tickRef.current);
    const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    setSaving(true);
    setError(null);
    try {
      const entry = await api.logActivity({
        activityType: activityType.trim(),
        durationMinutes,
        intensity,
        note: note || "Logged via start/stop timer",
      });
      setLastResult(entry);
      onLogged?.(entry);
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setRunning(false);
    runningRef.current = false;
    clearInterval(tickRef.current);
    setElapsedMs(0);
  }

  async function logCompleted(e, overrideType) {
    e?.preventDefault?.();
    setError(null);
    const type = (overrideType ?? activityType).trim();
    if (!type) {
      setError("What did you do? e.g. basketball, a run, a swim.");
      return;
    }
    setSaving(true);
    setLastResult(null);
    try {
      const entry = await api.logActivity({
        activityType: type,
        durationMinutes: Number(duration),
        intensity,
        note,
      });
      setLastResult(entry);
      onLogged?.(entry);
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // A countable-rep exercise routes straight to the paced rep counter
  // instead of being logged as a plain duration-based entry.
  function route(overrideType) {
    const type = (overrideType ?? activityType).trim();
    if (!type) {
      setError("What did you do, or are about to do?");
      return;
    }
    if (REP_EXERCISES.has(type.toLowerCase())) {
      setActivityType("");
      onStartReps?.(type);
      return;
    }
    logCompleted(null, type);
  }

  return (
    <div className="card">
      <h2>Get active</h2>
      <p className="muted">
        Type what you did (or are about to do) and hit go — a plain activity logs with the
        duration shown, a rep exercise (push-ups, squats...) jumps straight into the paced
        counter. Tabata and camera-tracked reps are one tap away below.
      </p>

      {!running && !saving && (
        <>
          <div className="meal-search">
            <span className="meal-search-icon" style={{ cursor: "default" }} aria-hidden="true">
              <PersonStanding size={18} strokeWidth={2.25} />
            </span>
            <input
              className="meal-search-input"
              value={activityType}
              placeholder="e.g. basketball, push-ups, a swim..."
              onChange={(e) => setActivityType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && route()}
            />
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              title="Duration in minutes (ignored for rep exercises)"
              style={{ width: 52, border: "none", background: "transparent", textAlign: "center", fontSize: "0.95rem" }}
            />
            <span className="muted" style={{ fontSize: "0.78rem", marginRight: 4 }}>min</span>
            <button type="button" className="meal-search-submit" onClick={() => route()} title="Go">
              <Send size={16} strokeWidth={2.25} color="#fff" />
            </button>
          </div>

          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {ACTIVITY_QUICK_PICKS.map((p) => (
              <button
                type="button"
                key={p}
                className="secondary"
                style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                onClick={() => route(p)}
              >
                {p}
              </button>
            ))}
            {REP_QUICK_PICKS.map((p) => (
              <button
                type="button"
                key={p}
                className="secondary"
                style={{ padding: "3px 10px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 4 }}
                onClick={() => route(p)}
              >
                <Hash size={12} strokeWidth={2.25} /> {p}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => startTimer()}>
              <Play size={14} strokeWidth={2.25} /> Start live timer instead
            </button>
            <button type="button" className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => onStartTabata?.()}>
              <Zap size={14} strokeWidth={2.25} /> Tabata
            </button>
            <button type="button" className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => onStartCamera?.()}>
              <Camera size={14} strokeWidth={2.25} /> Camera-tracked reps
            </button>
            <button
              type="button"
              onClick={() => setShowMore((s) => !s)}
              style={{ background: "none", border: "none", color: "var(--series-1)", cursor: "pointer", fontSize: "0.82rem" }}
            >
              {showMore ? "Hide" : "+ Intensity / note"}
            </button>
          </div>

          {showMore && (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field">
                <label>Intensity</label>
                <select value={intensity} onChange={(e) => setIntensity(e.target.value)}>
                  {INTENSITIES.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Note</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did it feel?" />
              </div>
            </div>
          )}

          {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
        </>
      )}

      {running && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <p className="muted" style={{ marginBottom: 4 }}>Now doing: <strong>{activityType}</strong></p>
          <div style={{ fontSize: "2.4rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatElapsed(elapsedMs)}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={stopTimer}>
              <Square size={13} strokeWidth={2.25} fill="#fff" /> Stop &amp; log
            </button>
            <button className="secondary" onClick={discard}>Discard</button>
          </div>
        </div>
      )}

      {saving && <p className="muted">Saving...</p>}

      {lastResult && (
        <div className="error-banner" style={{ background: "rgba(27,175,122,0.1)", borderColor: "rgba(27,175,122,0.4)", color: "var(--good)" }}>
          Logged {lastResult.activityType} — {lastResult.durationMinutes} min
          {lastResult.caloriesBurned != null && `, ~${lastResult.caloriesBurned} kcal burned`}.
        </div>
      )}
    </div>
  );
}

function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function StepGoalCard() {
  const [goalInfo, setGoalInfo] = useState(null);
  const [log, setLog] = useState([]);
  const [stepsInput, setStepsInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStepGoal(), api.getStepLog()]).then(([g, l]) => {
      setGoalInfo(g);
      setLog(l);
      setGoalInput(String(g.goal ?? g.suggested));
    }).finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = log.find((e) => e.date === today);
  const goal = goalInfo?.goal ?? goalInfo?.suggested ?? 3000;
  const steps = todayEntry?.steps ?? 0;
  const pct = Math.min(100, Math.round((steps / goal) * 100));
  const recent = [...log].reverse().slice(0, 7);

  async function saveGoal() {
    const g = await api.setStepGoal(Number(goalInput));
    setGoalInfo((gi) => ({ ...gi, goal: g.goal }));
    setEditingGoal(false);
  }

  async function submitSteps(e) {
    e.preventDefault();
    if (!stepsInput) return;
    const entry = await api.logSteps(Number(stepsInput));
    setLog((l) => [...l.filter((x) => x.date !== entry.date), entry]);
    setStepsInput("");
  }

  if (loading) return <div className="card"><p className="muted">Loading...</p></div>;

  return (
    <div className="card">
      <h2>Daily step goal</h2>
      <p className="muted">
        An easy walking target for days you don't do a structured workout — no need for intense
        exercise, just steady movement. {goalInfo?.goal == null && "Starting suggestion is based on your activity level; adjust it any time."}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{steps.toLocaleString()}</div>
        <div className="muted">
          / {goal.toLocaleString()} steps today {pct >= 100 && <span className="tag normal">Goal met</span>}
        </div>
      </div>
      <div className="macro-bar" style={{ height: 10 }}>
        <div className="seg-carbs" style={{ width: `${pct}%` }} />
      </div>

      <form onSubmit={submitSteps} style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input
          type="number"
          min="0"
          placeholder="Today's step count"
          value={stepsInput}
          onChange={(e) => setStepsInput(e.target.value)}
        />
        <button className="primary" type="submit">Update today</button>
      </form>

      <div style={{ marginTop: 10 }}>
        {editingGoal ? (
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min="500"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <button className="secondary" onClick={saveGoal}>Save goal</button>
          </span>
        ) : (
          <button className="secondary" onClick={() => setEditingGoal(true)}>
            Adjust goal ({goal.toLocaleString()}/day)
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <ul className="progress-list" style={{ marginTop: 12 }}>
          {recent.map((e) => (
            <li key={e.id}>
              <span>{e.date}</span>
              <span>
                {e.steps.toLocaleString()} steps
                {e.source && e.source !== "manual" && (
                  <span className="tag normal" style={{ marginLeft: 6 }}>
                    {e.source === "google_fit" ? "Google Fit" : "photo"}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActivityLog({ pendingWorkout, pendingRepSet, pendingTabata, pendingVideoExercise }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rep counter, Tabata, and the camera coach only mount once something —
  // the box above, or the coach via chat — actually asks for them, instead
  // of all three permanently taking up space on the tab.
  const [showRep, setShowRep] = useState(false);
  const [showTabata, setShowTabata] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [repTrigger, setRepTrigger] = useState(null);
  const [tabataTrigger, setTabataTrigger] = useState(null);

  useEffect(() => {
    api
      .getActivityLog()
      .then((data) => setEntries([...data].reverse()))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (pendingRepSet) { setShowRep(true); setRepTrigger(pendingRepSet); }
  }, [pendingRepSet]);
  useEffect(() => {
    if (pendingTabata) { setShowTabata(true); setTabataTrigger(pendingTabata); }
  }, [pendingTabata]);
  useEffect(() => {
    if (pendingVideoExercise) setShowVideo(true);
  }, [pendingVideoExercise]);

  async function startReps(type) {
    setShowRep(true);
    try {
      const result = await api.getRepSet(type);
      setRepTrigger({ ...result, token: Date.now() });
    } catch {
      // couldn't pre-build a set — the card is still shown, RepCounter's own
      // idle screen lets them retype and try again
    }
  }

  function startTabata(type) {
    setShowTabata(true);
    if (type) setTabataTrigger({ exerciseType: type, token: Date.now() });
  }

  async function remove(id) {
    await api.deleteActivity(id);
    setEntries((es) => es.filter((e) => e.id !== id));
  }

  const todayMinutes = entries.filter((e) => isToday(e.at)).reduce((s, e) => s + e.durationMinutes, 0);

  return (
    <>
      <ActivityBox
        onLogged={(entry) => setEntries((es) => [entry, ...es])}
        pendingWorkout={pendingWorkout}
        onStartReps={startReps}
        onStartTabata={startTabata}
        onStartCamera={() => setShowVideo(true)}
      />
      {showRep && <RepCounter onLogged={(entry) => setEntries((es) => [entry, ...es])} pendingRepSet={repTrigger} />}
      {showTabata && <TabataTimer onLogged={(entry) => setEntries((es) => [entry, ...es])} pendingTabata={tabataTrigger} />}
      {showVideo && <VideoExerciseCoach onLogged={(entry) => setEntries((es) => [entry, ...es])} pendingExercise={pendingVideoExercise} />}
      <StepGoalCard />
      <GoogleFitConnect />
      <DailyActivityCheckin />

      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          <strong>{todayMinutes}</strong> active minutes logged today. Every bit of movement counts
          toward your activity picture, on top of the light-exercise plan — it also banks treat
          credits, see Balance &amp; Rewards on the Cut Junk Food tab.
        </p>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        {loading && <p className="muted">Loading...</p>}
        {!loading && entries.length === 0 && <p className="muted">No activity logged yet.</p>}
        <ul className="progress-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span>
                <strong>{e.activityType}</strong> — {e.durationMinutes} min, {e.intensity}
                {e.caloriesBurned != null && `, ~${e.caloriesBurned} kcal`}{" "}
                <span className="muted">
                  ({new Date(e.at).toLocaleDateString()} {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                </span>
                {e.source && e.source !== "manual" && (
                  <span className="tag normal" style={{ marginLeft: 6 }}>
                    {e.source === "google_fit" ? "Google Fit" : "photo"}
                  </span>
                )}
                {e.note && <div className="muted">{e.note}</div>}
              </span>
              <button onClick={() => remove(e.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
