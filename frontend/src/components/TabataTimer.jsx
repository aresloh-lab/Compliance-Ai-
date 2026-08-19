import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, PartyPopper, Music } from "lucide-react";
import { api } from "../api.js";

const DEFAULT_WORK = 20;
const DEFAULT_REST = 10;
const DEFAULT_ROUNDS = 8;
const QUICK_PICKS = ["Burpees", "Jumping jacks", "Squats", "Mountain climbers", "High knees", "Push-ups"];

function useBeeper() {
  const ctxRef = useRef(null);
  return (freq = 880, durationMs = 150, volume = 0.2) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // Web Audio unsupported/blocked — the visual countdown still works fine
    }
  };
}

function searchLinks(track) {
  const q = encodeURIComponent(`${track.title} ${track.artist}`);
  return {
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
  };
}

export default function TabataTimer({ pendingTabata, onLogged }) {
  const [exerciseType, setExerciseType] = useState("");
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [workSeconds, setWorkSeconds] = useState(DEFAULT_WORK);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST);
  const [status, setStatus] = useState("idle"); // idle | active | done
  const [phase, setPhase] = useState("work"); // work | rest
  const [round, setRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_WORK);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tracks, setTracks] = useState(null);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState(null);
  const lastTokenRef = useRef(null);
  const beep = useBeeper();

  useEffect(() => {
    if (!pendingTabata || pendingTabata.token === lastTokenRef.current) return;
    lastTokenRef.current = pendingTabata.token;
    start(pendingTabata.exerciseType, pendingTabata.rounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTabata]);

  function start(overrideType, overrideRounds) {
    const type = (overrideType ?? exerciseType).trim() || "tabata";
    const r = overrideRounds && overrideRounds > 0 ? overrideRounds : rounds;
    setExerciseType(type);
    setRounds(r);
    setRound(1);
    setPhase("work");
    setSecondsLeft(workSeconds);
    setStatus("active");
    setRunning(true);
    if (!muted) beep(880, 200, 0.25);
  }

  // Ticks once a second; on hitting zero, switches work<->rest or advances
  // the round. Re-schedules on every dependency change so pause just works
  // (cleanup cancels the pending tick).
  useEffect(() => {
    if (status !== "active" || !running) return;
    const id = setTimeout(() => {
      if (secondsLeft <= 1) {
        if (phase === "work") {
          if (!muted) beep(440, 300, 0.25);
          setPhase("rest");
          setSecondsLeft(restSeconds);
        } else if (round >= rounds) {
          setStatus("done");
          setRunning(false);
        } else {
          if (!muted) beep(880, 200, 0.25);
          setRound((r) => r + 1);
          setPhase("work");
          setSecondsLeft(workSeconds);
        }
      } else {
        const next = secondsLeft - 1;
        if (next <= 3 && !muted) beep(660, 100, 0.18);
        setSecondsLeft(next);
      }
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, running, secondsLeft, phase, round, rounds, workSeconds, restSeconds, muted]);

  useEffect(() => {
    if (status === "done") logSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function logSession() {
    setSaving(true);
    try {
      const totalMinutes = Math.max(1, Math.round((rounds * (workSeconds + restSeconds)) / 60));
      const entry = await api.logActivity({
        activityType: `Tabata (${exerciseType})`,
        durationMinutes: totalMinutes,
        intensity: "vigorous",
        note: `${rounds} rounds x ${workSeconds}s work / ${restSeconds}s rest`,
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

  function stop() {
    reset();
  }

  function reset() {
    setStatus("idle");
    setRunning(false);
    setPhase("work");
    setRound(1);
    setSecondsLeft(workSeconds);
  }

  async function loadMusic() {
    setTracksLoading(true);
    setTracksError(null);
    try {
      const res = await api.getTabataMusic();
      setTracks(res.tracks);
    } catch (err) {
      setTracksError(err.message);
    } finally {
      setTracksLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Tabata interval timer</h2>
      <p className="muted">
        Classic Tabata structure — 20 seconds work, 10 seconds rest, repeated — with audio cues so
        you don't need to watch the clock. Pick suggested music below to play alongside it in
        whatever app you already use.
      </p>

      {status === "idle" && (
        <>
          <div className="field">
            <label>What are you doing during work intervals?</label>
            <input
              value={exerciseType}
              placeholder="e.g. burpees, jumping jacks"
              onChange={(e) => setExerciseType(e.target.value)}
            />
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK_PICKS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className="secondary"
                  style={{ padding: "3px 10px", fontSize: "0.78rem" }}
                  onClick={() => setExerciseType(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Rounds</label>
              <input type="number" min="1" max="20" value={rounds} onChange={(e) => setRounds(Number(e.target.value) || DEFAULT_ROUNDS)} />
            </div>
            <div className="field">
              <label>Work / Rest (seconds)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" min="5" max="120" value={workSeconds} onChange={(e) => setWorkSeconds(Number(e.target.value) || DEFAULT_WORK)} />
                <input type="number" min="5" max="120" value={restSeconds} onChange={(e) => setRestSeconds(Number(e.target.value) || DEFAULT_REST)} />
              </div>
            </div>
          </div>

          <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => start()}>
            <Play size={14} strokeWidth={2.25} fill="#fff" /> Start Tabata
          </button>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--gridline)" }}>
            <button className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={loadMusic} disabled={tracksLoading}>
              <Music size={14} strokeWidth={2.25} /> {tracksLoading ? "Finding tracks..." : "Suggest Tabata music"}
            </button>
            {tracksError && <div className="error-banner" style={{ marginTop: 8 }}>{tracksError}</div>}
            {tracks && (
              <ul className="list-plain" style={{ marginTop: 10 }}>
                {tracks.map((t, i) => {
                  const links = searchLinks(t);
                  return (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <strong>{t.title}</strong> — {t.artist}
                      <span className="muted"> ({t.note})</span>
                      <br />
                      <a href={links.youtube} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem" }}>YouTube</a>
                      {" · "}
                      <a href={links.spotify} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem" }}>Spotify</a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {status === "active" && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <p className="muted" style={{ marginBottom: 2 }}>
            Round {round} / {rounds} — {exerciseType}
          </p>
          <div
            style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 999,
              fontWeight: 700,
              letterSpacing: 1,
              marginBottom: 6,
              background: phase === "work" ? "rgba(12,163,12,0.14)" : "rgba(250,178,25,0.2)",
              color: phase === "work" ? "var(--good)" : "#a06a00",
            }}
          >
            {phase === "work" ? "WORK" : "REST"}
          </div>
          <div style={{ fontSize: "3rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {secondsLeft}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
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

      {status === "done" && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--series-1)" }}>
            <PartyPopper size={36} strokeWidth={2} />
          </div>
          <p style={{ fontWeight: 600, margin: "6px 0" }}>
            Tabata complete — {rounds} rounds of {exerciseType}!
          </p>
          <p className="muted">{saving ? "Logging it..." : "Logged to your activity."}</p>
          <button className="secondary" style={{ marginTop: 10 }} onClick={reset}>Do another round</button>
        </div>
      )}
    </div>
  );
}
