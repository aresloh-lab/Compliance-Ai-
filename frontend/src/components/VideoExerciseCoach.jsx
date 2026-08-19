import React, { useEffect, useRef, useState } from "react";
import { Camera, Hand, Square, PartyPopper } from "lucide-react";
import { api } from "../api.js";
import {
  EXERCISE_CONFIGS,
  createRepTracker,
  updateRepTracker,
  isStalled,
  createWaveDetector,
  updateWaveDetector,
  estimateBurnFromReps,
} from "../videoExerciseEngine.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const STALL_MS = 6000;

// Camera on, MediaPipe Pose running entirely in the browser (WASM) — no
// video frame or image is ever sent to any server. Rep counting is plain
// joint-angle trigonometry (see videoExerciseEngine.js), not a per-frame AI
// judgment call, so it can run smoothly at full frame rate with zero
// per-rep latency or API cost.
export default function VideoExerciseCoach({ pendingExercise, onLogged }) {
  const [exerciseType, setExerciseType] = useState("situp");
  const [phase, setPhase] = useState("idle"); // idle | loading | waiting_wave | countdown | tracking | done | error
  const [error, setError] = useState(null);
  const [reps, setReps] = useState(0);
  const [stalledNow, setStalledNow] = useState(false);
  const [countdownText, setCountdownText] = useState("");
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const waveDetectorRef = useRef(createWaveDetector());
  const repTrackerRef = useRef(null);
  const trackingStartedAtRef = useRef(null);
  const phaseRef = useRef("idle"); // mirrors `phase` for use inside the rAF loop without stale closures
  const lastTokenRef = useRef(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!pendingExercise || pendingExercise.token === lastTokenRef.current) return;
    lastTokenRef.current = pendingExercise.token;
    if (EXERCISE_CONFIGS[pendingExercise.exerciseType]) setExerciseType(pendingExercise.exerciseType);
  }, [pendingExercise]);

  useEffect(() => stopEverything, []);

  async function enableCamera() {
    setError(null);
    setSummary(null);
    setReps(0);
    setPhase("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      if (!poseLandmarkerRef.current) {
        const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
        poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }

      waveDetectorRef.current = createWaveDetector();
      setPhase("waiting_wave");
      rafRef.current = requestAnimationFrame(frameLoop);
    } catch (err) {
      console.error(err);
      setError(
        err.name === "NotAllowedError"
          ? "Camera access was denied — allow camera access to use live exercise tracking."
          : `Couldn't start the camera or load the tracking model: ${err.message}`
      );
      setPhase("error");
      stopEverything();
    }
  }

  function frameLoop() {
    const video = videoRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(frameLoop);
      return;
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks?.[0] ?? null;
      handleFrame(landmarks);
      drawOverlay(landmarks);
    }

    rafRef.current = requestAnimationFrame(frameLoop);
  }

  function handleFrame(landmarks) {
    const now = Date.now();
    const current = phaseRef.current;

    if (current === "waiting_wave") {
      if (updateWaveDetector(waveDetectorRef.current, landmarks, now)) {
        beginCountdown();
      }
      return;
    }

    if (current === "tracking" && repTrackerRef.current) {
      const result = updateRepTracker(repTrackerRef.current, landmarks, now);
      if (result.repCompleted) setReps(repTrackerRef.current.reps);
      setStalledNow(isStalled(repTrackerRef.current, now, STALL_MS));
    }
  }

  function beginCountdown() {
    setPhase("countdown");
    const steps = ["Get ready", "3", "2", "1", "Go!"];
    steps.forEach((text, i) => {
      setTimeout(() => {
        setCountdownText(text);
        if (i === steps.length - 1) {
          setTimeout(() => {
            repTrackerRef.current = createRepTracker(exerciseType);
            trackingStartedAtRef.current = Date.now();
            setReps(0);
            setStalledNow(false);
            setPhase("tracking");
          }, 500);
        }
      }, i * 600);
    });
  }

  function drawOverlay(landmarks) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    ctx.strokeStyle = "rgba(42,120,214,0.85)";
    ctx.lineWidth = 3;
    for (const { start, end } of POSE_CONNECTIONS) {
      const a = landmarks[start];
      const b = landmarks[end];
      if (!a || !b || (a.visibility ?? 1) < 0.4 || (b.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(235,104,52,0.9)";
    for (const lm of landmarks) {
      if ((lm.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function finishSession() {
    const trackerReps = repTrackerRef.current?.reps ?? reps;
    const startedAt = trackingStartedAtRef.current;
    const durationSeconds = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;
    const stoppedEarly = stalledNow;

    stopEverything();
    setPhase("done");

    if (trackerReps <= 0) {
      setSummary({ reps: 0, durationSeconds, stoppedEarly, caloriesBurned: 0, fatGramsEquivalent: 0 });
      return;
    }

    setSaving(true);
    try {
      const profile = await api.getProfile();
      const { caloriesBurned, fatGramsEquivalent } = estimateBurnFromReps({
        exerciseType,
        reps: trackerReps,
        weightKg: profile?.weightKg,
      });
      setSummary({ reps: trackerReps, durationSeconds, stoppedEarly, caloriesBurned, fatGramsEquivalent });

      const label = EXERCISE_CONFIGS[exerciseType].label;
      const entry = await api.logActivity({
        activityType: `${label}s (camera-tracked)`,
        durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
        intensity: "moderate",
        note: `Live camera tracking: ${trackerReps} ${label}s in ${durationSeconds}s${stoppedEarly ? " — looked like it stopped partway through" : ", completed"}. ~${caloriesBurned} kcal / ~${fatGramsEquivalent}g fat-equivalent (estimate).`,
      });
      onLogged?.(entry);
    } catch (err) {
      setError(`Tracked ${trackerReps} reps, but couldn't save it: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function stopEverything() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    lastVideoTimeRef.current = -1;
  }

  function cancelSession() {
    stopEverything();
    setPhase("idle");
    setReps(0);
    setStalledNow(false);
  }

  function reset() {
    setPhase("idle");
    setSummary(null);
    setReps(0);
    setError(null);
  }

  const config = EXERCISE_CONFIGS[exerciseType];
  const cameraOn = phase !== "idle" && phase !== "error" && phase !== "done";

  return (
    <div className="card">
      <h2>AI video exercise coach</h2>
      <p className="muted">
        Enable your camera, wave to start, and it'll count your reps live by tracking your body's
        joint angles — entirely on your device, nothing is uploaded. Works best with your full body
        (or at least torso and the relevant joints) in frame, in reasonable lighting.
      </p>

      {phase === "idle" && (
        <>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Exercise</label>
            <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value)}>
              {Object.entries(EXERCISE_CONFIGS).map(([id, c]) => (
                <option key={id} value={id}>{c.label}s</option>
              ))}
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={enableCamera}>
            <Camera size={14} strokeWidth={2.25} /> Enable camera
          </button>
        </>
      )}

      {cameraOn && (
        <div style={{ position: "relative", maxWidth: 480, margin: "0 auto" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 10, transform: "scaleX(-1)", display: "block" }} />
          <canvas
            ref={canvasRef}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform: "scaleX(-1)" }}
          />

          {phase === "loading" && (
            <div style={overlayBoxStyle}><p style={{ margin: 0 }}>Loading camera and tracking model...</p></div>
          )}
          {phase === "waiting_wave" && (
            <div style={overlayBoxStyle}>
              <p style={{ margin: 0, fontSize: "1.3rem", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Hand size={22} strokeWidth={2.25} /> Wave to start!
              </p>
            </div>
          )}
          {phase === "countdown" && (
            <div style={overlayBoxStyle}><p style={{ margin: 0, fontSize: "2rem", fontWeight: 700 }}>{countdownText}</p></div>
          )}
          {phase === "tracking" && (
            <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "6px 12px", borderRadius: 8 }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, lineHeight: 1 }}>{reps}</div>
              <div style={{ fontSize: "0.75rem" }}>{config.label}s</div>
            </div>
          )}
          {phase === "tracking" && stalledNow && (
            <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, background: "rgba(250,178,25,0.9)", color: "#3a2a00", padding: "6px 10px", borderRadius: 8, fontSize: "0.85rem", textAlign: "center" }}>
              Looks like you paused — still there? Tap Finish when you're done.
            </div>
          )}
        </div>
      )}

      {phase === "tracking" && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={finishSession}>
            <Square size={13} strokeWidth={2.25} fill="#fff" /> Finish
          </button>
        </div>
      )}
      {(phase === "waiting_wave" || phase === "loading" || phase === "countdown") && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="secondary" onClick={cancelSession}>Cancel</button>
        </div>
      )}

      {error && phase !== "idle" && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

      {phase === "done" && summary && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          {summary.reps > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "center", color: "var(--series-1)" }}>
                <PartyPopper size={36} strokeWidth={2} />
              </div>
              <p style={{ fontWeight: 600, margin: "6px 0" }}>
                {summary.reps} {config.label}s tracked in {summary.durationSeconds}s
                {summary.stoppedEarly ? " (looked like you paused near the end)" : ""}.
              </p>
              <p className="muted" style={{ margin: 0 }}>
                ~{summary.caloriesBurned} kcal burned, ~{summary.fatGramsEquivalent}g fat-equivalent
                (rough estimate from rep count and body weight — not a lab measurement).
              </p>
              <p className="muted" style={{ marginTop: 6 }}>{saving ? "Saving..." : "Logged to your activity."}</p>
            </>
          ) : (
            <p className="muted">No reps were detected — try again with more of your body in frame.</p>
          )}
          <button className="secondary" style={{ marginTop: 10 }} onClick={reset}>Track another set</button>
        </div>
      )}
    </div>
  );
}

const overlayBoxStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.35)",
  color: "#fff",
  borderRadius: 10,
  textAlign: "center",
};

// Minimal BlazePose skeleton edges (torso + limbs) for the overlay — a
// static fallback so drawing works even before PoseLandmarker.POSE_CONNECTIONS
// (only available after the module has loaded) is read.
const POSE_CONNECTIONS = [
  { start: 11, end: 12 }, { start: 11, end: 23 }, { start: 12, end: 24 }, { start: 23, end: 24 },
  { start: 11, end: 13 }, { start: 13, end: 15 }, { start: 12, end: 14 }, { start: 14, end: 16 },
  { start: 23, end: 25 }, { start: 25, end: 27 }, { start: 24, end: 26 }, { start: 26, end: 28 },
];
