import { createMessage } from "./claude.js";
import { extractJson } from "./util.js";

// Deterministic table first (fast, free, matches the calorieBurn.js pattern)
// for common countable bodyweight exercises; AI fallback only classifies
// exercise text the table doesn't recognize. Rep counts are tiered by the
// user's activity level as a fitness-level proxy, and deliberately
// conservative — the point is completing a set and building the habit, not
// maximum exertion, consistent with this app's easy-does-it philosophy.
const REP_TABLE = [
  {
    keywords: ["push up", "push-up", "pushup"],
    label: "push-up",
    phases: ["Down", "Up"],
    pacePerRepSeconds: 3,
    reps: { sedentary: 6, light: 10, moderate: 15, active: 20 },
  },
  {
    keywords: ["sit up", "sit-up", "situp", "crunch"],
    label: "sit-up",
    phases: ["Down", "Up"],
    pacePerRepSeconds: 2.5,
    reps: { sedentary: 8, light: 12, moderate: 18, active: 25 },
  },
  {
    keywords: ["squat"],
    label: "squat",
    phases: ["Down", "Up"],
    pacePerRepSeconds: 3,
    reps: { sedentary: 8, light: 12, moderate: 18, active: 25 },
  },
  {
    keywords: ["lunge"],
    label: "lunge",
    phases: ["Step", "Back"],
    pacePerRepSeconds: 3,
    reps: { sedentary: 6, light: 10, moderate: 14, active: 18 },
  },
  {
    keywords: ["jumping jack"],
    label: "jumping jack",
    phases: ["Out", "In"],
    pacePerRepSeconds: 1.5,
    reps: { sedentary: 15, light: 20, moderate: 30, active: 40 },
  },
  {
    keywords: ["burpee"],
    label: "burpee",
    phases: ["Down", "Up"],
    pacePerRepSeconds: 4,
    reps: { sedentary: 5, light: 8, moderate: 12, active: 16 },
  },
  {
    keywords: ["mountain climber"],
    label: "mountain climber",
    phases: ["Left", "Right"],
    pacePerRepSeconds: 1.2,
    reps: { sedentary: 16, light: 24, moderate: 32, active: 40 },
  },
  {
    keywords: ["high knee"],
    label: "high knee",
    phases: ["Left", "Right"],
    pacePerRepSeconds: 1,
    reps: { sedentary: 20, light: 30, moderate: 40, active: 50 },
  },
  {
    keywords: ["calf raise"],
    label: "calf raise",
    phases: ["Up", "Down"],
    pacePerRepSeconds: 2,
    reps: { sedentary: 10, light: 15, moderate: 20, active: 25 },
  },
  {
    keywords: ["glute bridge", "hip bridge"],
    label: "glute bridge",
    phases: ["Up", "Down"],
    pacePerRepSeconds: 2.5,
    reps: { sedentary: 8, light: 12, moderate: 18, active: 24 },
  },
];

const MIN_REPS = 4;
const MAX_REPS = 60; // safety cap regardless of what the table or AI fallback returns
const MIN_PACE = 1;
const MAX_PACE = 6;

function matchTable(exerciseType) {
  const text = exerciseType.toLowerCase().trim();
  return REP_TABLE.find((entry) => entry.keywords.some((k) => text.includes(k))) ?? null;
}

function classifierPrompt(exerciseType) {
  return `You are a fitness-set classifier for a beginner-friendly home workout app. Given the countable-rep bodyweight exercise "${exerciseType}", respond with ONLY a JSON object (no markdown, no prose) matching this shape: {"label": string, "phases": [string, string], "pacePerRepSeconds": number, "reps": {"sedentary": number, "light": number, "moderate": number, "active": number}}. "phases" are the two short words to announce for each half of one rep (e.g. ["Down","Up"]). "pacePerRepSeconds" is how many seconds one full rep should take at a beginner-followable pace (1-5). "reps" are a conservative, beginner-friendly rep count for one set at each fitness level — err low, this is about completing a set and building the habit, not maximum exertion. If the text isn't a real countable bodyweight exercise, pick the closest reasonable match rather than refusing.`;
}

function fitnessTier(profile) {
  const level = profile?.activityLevel;
  return ["sedentary", "light", "moderate", "active"].includes(level) ? level : "light";
}

function clampReps(n) {
  const num = Math.round(Number(n));
  if (!Number.isFinite(num)) return MIN_REPS;
  return Math.max(MIN_REPS, Math.min(MAX_REPS, num));
}

function clampPace(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 2.5;
  return Math.max(MIN_PACE, Math.min(MAX_PACE, num));
}

export async function buildRepSet({ exerciseType, profile }) {
  const tier = fitnessTier(profile);
  let match = matchTable(exerciseType);
  let source = "table";

  if (!match) {
    try {
      const raw = await createMessage({
        system: classifierPrompt(exerciseType),
        messages: [{ role: "user", content: "Classify this exercise." }],
        maxTokens: 300,
      });
      const parsed = extractJson(raw);
      if (parsed?.reps && Array.isArray(parsed?.phases) && parsed.phases.length === 2) {
        match = parsed;
        source = "ai";
      }
    } catch {
      // fall through to the safe generic default below
    }
  }

  if (!match) {
    match = {
      label: exerciseType,
      phases: ["Down", "Up"],
      pacePerRepSeconds: 3,
      reps: { sedentary: 6, light: 10, moderate: 15, active: 20 },
    };
    source = "fallback";
  }

  return {
    exerciseType: match.label || exerciseType,
    phases: match.phases,
    pacePerRepSeconds: clampPace(match.pacePerRepSeconds),
    reps: clampReps(match.reps[tier] ?? match.reps.light ?? match.reps.moderate),
    source,
  };
}
