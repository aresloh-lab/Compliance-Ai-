// Pure logic for camera-based exercise tracking — deliberately has no DOM/
// React/MediaPipe dependency so the rep-counting math can be unit tested on
// its own. Consumes MediaPipe Pose Landmarker output (33 normalized 2D
// landmarks with .x/.y/.visibility) each frame; the component owns the
// camera, the model, and the render loop.
//
// Same "deterministic math, not AI, for the physiological/geometric part"
// pattern as calorieBurn.js and weightLossProgram.js — joint angles are
// plain trigonometry, not a model judgment call.

// BlazePose (MediaPipe Pose) 33-point landmark indices used here.
export const LANDMARKS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

const MIN_VISIBILITY = 0.5;

export function angleBetween(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return null;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function pickSide(landmarks, joints) {
  let best = null;
  for (const side of ["left", "right"]) {
    const [ai, bi, ci] = joints[side];
    const a = landmarks[ai];
    const b = landmarks[bi];
    const c = landmarks[ci];
    if (!a || !b || !c) continue;
    const score = ((a.visibility ?? 0) + (b.visibility ?? 0) + (c.visibility ?? 0)) / 3;
    if (score >= MIN_VISIBILITY && (!best || score > best.score)) {
      best = { a, b, c, score };
    }
  }
  return best;
}

// restAngleMin / activeAngleMax are threshold angles (degrees) at the
// tracked joint. "rest" is the position the rep starts and ends in;
// "active" is the position that signals full range of motion was reached.
// A rep counts on the active -> rest transition (back to start = rep done).
export const EXERCISE_CONFIGS = {
  situp: {
    label: "sit-up",
    joints: { left: [11, 23, 25], right: [12, 24, 26] }, // shoulder-hip-knee
    restAngleMin: 150,
    activeAngleMax: 120,
    kcalPerRepPer70kg: 0.3,
  },
  pushup: {
    label: "push-up",
    joints: { left: [11, 13, 15], right: [12, 14, 16] }, // shoulder-elbow-wrist
    restAngleMin: 155,
    activeAngleMax: 95,
    kcalPerRepPer70kg: 0.32,
  },
  squat: {
    label: "squat",
    joints: { left: [23, 25, 27], right: [24, 26, 28] }, // hip-knee-ankle
    restAngleMin: 160,
    activeAngleMax: 100,
    kcalPerRepPer70kg: 0.35,
  },
};

export function createRepTracker(exerciseType) {
  const config = EXERCISE_CONFIGS[exerciseType];
  if (!config) throw new Error(`Unknown exercise type: ${exerciseType}`);
  return { config, phase: "rest", reps: 0, lastRepAt: null, lastTransitionAt: null };
}

// Call once per analyzed video frame. Mutates and returns the tracker's
// per-frame read, plus whether a rep was just completed this call.
export function updateRepTracker(tracker, landmarks, now = Date.now()) {
  const picked = landmarks ? pickSide(landmarks, tracker.config.joints) : null;
  if (!picked) return { repCompleted: false, angle: null, phase: tracker.phase, visible: false };

  const angle = angleBetween(picked.a, picked.b, picked.c);
  if (angle == null) return { repCompleted: false, angle: null, phase: tracker.phase, visible: false };

  let repCompleted = false;
  if (tracker.phase === "rest" && angle <= tracker.config.activeAngleMax) {
    tracker.phase = "active";
    tracker.lastTransitionAt = now;
  } else if (tracker.phase === "active" && angle >= tracker.config.restAngleMin) {
    tracker.phase = "rest";
    tracker.lastTransitionAt = now;
    tracker.reps += 1;
    tracker.lastRepAt = now;
    repCompleted = true;
  }
  return { repCompleted, angle, phase: tracker.phase, visible: true };
}

// True once no phase transition has happened for `stallMs` after tracking
// has actually begun — this is the "did the user stop in the middle" signal.
export function isStalled(tracker, now = Date.now(), stallMs = 6000) {
  const reference = tracker.lastTransitionAt;
  if (reference == null) return false;
  return now - reference > stallMs;
}

const WAVE_WINDOW_MS = 2500;
const WAVE_MIN_CROSSINGS = 4; // roughly two full waves (up-down-up-down)

export function createWaveDetector() {
  return { crossings: [], lastAbove: null };
}

// A "wave" is the wrist repeatedly crossing above/below shoulder height in
// a short window — cheap, robust, and doesn't need a trained gesture model.
export function updateWaveDetector(detector, landmarks, now = Date.now()) {
  if (!landmarks) return false;
  const rw = landmarks[LANDMARKS.rightWrist];
  const rs = landmarks[LANDMARKS.rightShoulder];
  const lw = landmarks[LANDMARKS.leftWrist];
  const ls = landmarks[LANDMARKS.leftShoulder];

  let wrist = null;
  let shoulder = null;
  if (rw && rs && (rw.visibility ?? 0) > MIN_VISIBILITY) {
    wrist = rw;
    shoulder = rs;
  } else if (lw && ls && (lw.visibility ?? 0) > MIN_VISIBILITY) {
    wrist = lw;
    shoulder = ls;
  }
  if (!wrist || !shoulder) return false;

  const above = wrist.y < shoulder.y; // normalized image coords: y grows downward
  if (detector.lastAbove !== null && above !== detector.lastAbove) {
    detector.crossings.push(now);
  }
  detector.lastAbove = above;
  detector.crossings = detector.crossings.filter((t) => now - t <= WAVE_WINDOW_MS);
  return detector.crossings.length >= WAVE_MIN_CROSSINGS;
}

// Rough, transparently-approximate estimate — not a metabolic measurement.
// kcalPerRepPer70kg values are ballpark published per-rep energy costs for a
// ~70kg reference adult, scaled linearly by actual body weight (same style
// as the MET formulas elsewhere in this app). fatGramsEquivalent assumes the
// calorie deficit came entirely from fat stores (7700 kcal/kg, the same
// constant weightLossProgram.js uses) — a simplification, not a real-time
// substrate-oxidation reading, which would need actual metabolic testing.
const KCAL_PER_KG_FAT = 7700;

export function estimateBurnFromReps({ exerciseType, reps, weightKg }) {
  const config = EXERCISE_CONFIGS[exerciseType];
  if (!config || !reps) return { caloriesBurned: 0, fatGramsEquivalent: 0 };
  const effectiveWeight = weightKg > 0 ? weightKg : 70;
  const caloriesBurned = Math.round(reps * config.kcalPerRepPer70kg * (effectiveWeight / 70));
  const fatGramsEquivalent = Math.round((caloriesBurned / KCAL_PER_KG_FAT) * 1000);
  return { caloriesBurned, fatGramsEquivalent };
}
