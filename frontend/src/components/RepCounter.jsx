import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, PartyPopper } from "lucide-react";
import { api } from "../api.js";

const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;
const QUICK_PICKS = ["Push-ups", "Squats", "Sit-ups", "Lunges", "Jumping jacks", "Burpees", "Mountain climbers", "High knees"];

function speak(text, muted) {
  if (muted || !ttsSupported) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.15;
  window.speechSynthesis.speak(utterance);
}

export default function RepCounter({ pendingRepSet, onLogged }) {
  const [exerciseType, setExerciseType] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | countdown | active | done | error
  const [set, setSet] = useState(null); // { exerciseType, phases, pacePerRepSeconds, reps }
  const [countdownText, setCountdownText] = useState("");
  const [repIndex, setRepIndex] = useState(0); // 0-based rep currently in progress
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const lastTokenRef = useRef(null);

  // Triggered by the coach ("let's do push-ups") — the backend already
  // computed the rep set, so this skips straight to the countdown.
  useEffect(() => {
    if (!pendingRepSet || pendingRepSet.token === lastTokenRef.current) return;
    lastTokenRef.current = pendingRepSet.token;
    beginWithSet(pendingRepSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRepSet]);

  async function startFromPicker(overrideType) {
    const type = (overrideType ?? exerciseType).trim();
    if (!type) {
      setError("What exercise? e.g. push-ups, squats.");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const result = await api.getRepSet(type);
      beginWithSet(result);
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  function beginWithSet(result) {
    setSet(result);
    setExerciseType(result.exerciseType);
    setRepIndex(0);
    setPhaseIndex(0);
    setStatus("countdown");
    runCountdown();
  }

  function runCountdown() {
    const steps = ["Get ready", "3", "2", "1", "Go!"];
    steps.forEach((text, i) => {
      setTimeout(() => {
        setCountdownText(text);
        speak(text, muted);
        if (i === steps.length - 1) {
          setTimeout(() => {
            setStatus("active");
            setRunning(true);
            speak("1", muted);
          }, 700);
        }
      }, i * 700);
    });
  }

  // Drives the down/up pacing. Re-schedules on every phase/rep change and on
  // pause/resume; cleanup automatically cancels the pending step, which is
  // what makes pause just work.
  useEffect(() => {
    if (status !== "active" || !running || !set) return;
    const halfMs = (set.pacePerRepSeconds * 1000) / 2;
    const id = setTimeout(() => {
      if (phaseIndex === 0) {
        speak(set.phases[1], muted);
        setPhaseIndex(1);
      } else if (repIndex + 1 >= set.reps) {
        setStatus("done");
        setRunning(false);
      } else {
        const nextRep = repIndex + 1;
        speak(String(nextRep + 1), muted);
        setRepIndex(nextRep);
        setPhaseIndex(0);
      }
    }, halfMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, running, repIndex, phaseIndex, set]);

  useEffect(() => {
    if (status === "done") logCompletedSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function logCompletedSet() {
    if (!set) return;
    setSaving(true);
    try {
      const totalSeconds = set.reps * set.pacePerRepSeconds;
      const entry = await api.logActivity({
        activityType: `${set.exerciseType}s`,
        durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
        intensity: "moderate",
        note: `Completed a paced set: ${set.reps} ${set.exerciseType}s`,
      });
      onLogged?.(entry);
    } catch {
      // logging failure shouldn't block the completion screen
    } finally {
      setSaving(false);
    }
  }

  function pauseResume() {
    setRunning((r) => !r);
  }

  function skipRep() {
    if (!set) return;
    if (repIndex + 1 >= set.reps) {
      setStatus("done");
      setRunning(false);
      return;
    }
    const nextRep = repIndex + 1;
    speak(String(nextRep + 1), muted);
    setRepIndex(nextRep);
    setPhaseIndex(0);
  }

  function stop() {
    window.speechSynthesis?.cancel();
    reset();
  }

  function reset() {
    setStatus("idle");
    setSet(null);
    setExerciseType("");
    setRepIndex(0);
    setPhaseIndex(0);
    setRunning(false);
    setError(null);
    setCountdownText("");
  }

  const phaseLabel = set?.phases?.[phaseIndex] ?? "";
  const pct = set ? Math.round(((repIndex + (phaseIndex === 1 ? 0.5 : 0)) / set.reps) * 100) : 0;

  return (
    <div className="card">
      <h2>Rep counter</h2>
      <p className="muted">
        Tell it what you're doing and it'll pace you through a full set — a big on-screen counter
        plus spoken cues, so you can just follow along instead of counting yourself. Set size is
        chosen for your fitness level, not a maximum-effort target.
      </p>

      {status === "idle" && (
        <>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label>What are you doing?</label>
            <input
              value={exerciseType}
              placeholder="e.g. push-ups, squats, sit-ups"
              onChange={(e) => setExerciseType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startFromPicker()}
            />
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK_PICKS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className="secondary"
                  style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  onClick={() => startFromPicker(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => startFromPicker()}>
            <Play size={14} strokeWidth={2.25} fill="#fff" /> Start set
          </button>
        </>
      )}

      {status === "loading" && <p className="muted">Working out a good set size for you...</p>}

      {status === "countdown" && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: "2.2rem", fontWeight: 700 }}>{countdownText}</div>
        </div>
      )}

      {status === "active" && set && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <p className="muted" style={{ marginBottom: 2 }}>{set.exerciseType}s</p>

          <div
            onClick={skipRep}
            style={{
              margin: "8px auto",
              width: 110,
              height: 110,
              borderRadius: "50%",
              background: "var(--series-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transform: phaseIndex === 0 ? "scale(0.86)" : "scale(1)",
              transition: `transform ${set.pacePerRepSeconds / 2}s ease-in-out`,
            }}
            title="Tap to advance manually"
          >
            <span style={{ fontSize: "2.4rem", fontWeight: 700, color: "#fff" }}>{repIndex + 1}</span>
          </div>

          <div style={{ fontSize: "1.3rem", fontWeight: 600, letterSpacing: 1 }}>{phaseLabel}</div>
          <p className="muted" style={{ margin: "4px 0 10px" }}>
            {repIndex + 1} / {set.reps} reps
          </p>
          <div className="macro-bar" style={{ height: 8, maxWidth: 240, margin: "0 auto" }}>
            <div className="seg-carbs" style={{ width: `${pct}%` }} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
            <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={pauseResume}>
              {running ? <Pause size={14} strokeWidth={2.25} fill="#fff" /> : <Play size={14} strokeWidth={2.25} fill="#fff" />}
              {running ? "Pause" : "Resume"}
            </button>
            <button className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX size={14} strokeWidth={2.25} /> : <Volume2 size={14} strokeWidth={2.25} />}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={stop} style={{ background: "none", border: "none", color: "var(--critical)", cursor: "pointer" }}>
              Stop
            </button>
          </div>
        </div>
      )}

      {status === "done" && set && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--series-1)" }}>
            <PartyPopper size={36} strokeWidth={2} />
          </div>
          <p style={{ fontWeight: 600, margin: "6px 0" }}>
            Set complete — {set.reps} {set.exerciseType}s!
          </p>
          <p className="muted">{saving ? "Logging it..." : "Logged to your activity."}</p>
          <button className="secondary" style={{ marginTop: 10 }} onClick={reset}>Do another set</button>
        </div>
      )}
    </div>
  );
}
