import { createMessage } from "./claude.js";
import { extractJson } from "./util.js";

// MET (Metabolic Equivalent of Task) values, simplified from the Compendium
// of Physical Activities. calories = MET x weightKg x hours — standard sports
// -science formula. Deterministic table match first (fast, free, no AI
// round trip for a live "stop workout" tap); an AI fallback only classifies
// activity text the table doesn't recognize.
const MET_TABLE = [
  { keywords: ["walk"], met: { light: 2.8, moderate: 3.5, vigorous: 4.5 } },
  { keywords: ["run", "jog"], met: { light: 6, moderate: 8, vigorous: 11 } },
  { keywords: ["swim"], met: { light: 5.5, moderate: 7, vigorous: 10 } },
  { keywords: ["cycle", "cycling", "bike", "biking", "spin"], met: { light: 4, moderate: 6, vigorous: 10 } },
  { keywords: ["basketball"], met: { light: 4.5, moderate: 6.5, vigorous: 8 } },
  { keywords: ["football", "soccer"], met: { light: 5, moderate: 7, vigorous: 10 } },
  { keywords: ["badminton", "tennis", "squash", "table tennis", "ping pong"], met: { light: 4, moderate: 6, vigorous: 8 } },
  { keywords: ["dance", "dancing", "zumba"], met: { light: 3, moderate: 5, vigorous: 7.5 } },
  { keywords: ["yoga"], met: { light: 2, moderate: 2.5, vigorous: 4 } },
  { keywords: ["pilates"], met: { light: 2.5, moderate: 3, vigorous: 4 } },
  { keywords: ["gym", "weight", "strength", "resistance", "workout"], met: { light: 3, moderate: 5, vigorous: 6 } },
  { keywords: ["hiit", "tabata", "circuit", "interval"], met: { light: 6, moderate: 8, vigorous: 12 } },
  { keywords: ["box", "kickbox", "muay thai"], met: { light: 5, moderate: 7.8, vigorous: 12.8 } },
  { keywords: ["hike", "hiking", "trekking"], met: { light: 4, moderate: 6, vigorous: 8 } },
  { keywords: ["stair"], met: { light: 4, moderate: 8, vigorous: 15 } },
  { keywords: ["jump rope", "skipping"], met: { light: 8, moderate: 10, vigorous: 12.3 } },
  { keywords: ["row", "rowing"], met: { light: 4.8, moderate: 7, vigorous: 8.5 } },
  { keywords: ["elliptical"], met: { light: 4.6, moderate: 5, vigorous: 7 } },
  { keywords: ["stretch"], met: { light: 2, moderate: 2.3, vigorous: 3 } },
  { keywords: ["climb", "climbing"], met: { light: 5, moderate: 8, vigorous: 11 } },
  { keywords: ["martial art", "karate", "taekwondo", "judo"], met: { light: 5, moderate: 7.5, vigorous: 10.3 } },
  { keywords: ["golf"], met: { light: 3, moderate: 4.3, vigorous: 5 } },
  { keywords: ["volleyball"], met: { light: 3, moderate: 4, vigorous: 8 } },
  { keywords: ["skateboard", "rollerblad", "skating"], met: { light: 5, moderate: 7, vigorous: 9.8 } },
  { keywords: ["bowling"], met: { light: 2.8, moderate: 3, vigorous: 3.5 } },
];

function matchTable(activityType) {
  const text = activityType.toLowerCase().trim();
  for (const entry of MET_TABLE) {
    if (entry.keywords.some((k) => text.includes(k))) return entry.met;
  }
  return null;
}

function metPrompt(activityType) {
  return `You are a physical-activity classifier. Given the activity "${activityType}", respond with ONLY a JSON object (no markdown, no prose) matching this shape: {"met": {"light": number, "moderate": number, "vigorous": number}}. Use real MET (Metabolic Equivalent of Task) values from standard exercise physiology references for this specific activity at light, moderate, and vigorous intensity. If the activity is not real physical exercise (e.g. "sitting", "watching TV", nonsense text), return {"met": {"light": 1, "moderate": 1, "vigorous": 1}}.`;
}

export async function estimateCaloriesBurned({ activityType, durationMinutes, intensity, weightKg }) {
  if (!weightKg || !durationMinutes) return null;

  let met = matchTable(activityType);
  let source = "table";

  if (!met) {
    try {
      const raw = await createMessage({
        system: metPrompt(activityType),
        messages: [{ role: "user", content: "Classify this activity's MET values." }],
        maxTokens: 200,
      });
      const parsed = extractJson(raw);
      if (parsed?.met?.moderate) {
        met = parsed.met;
        source = "ai";
      }
    } catch {
      // fall through — no estimate rather than a bad guess
    }
  }

  if (!met) return null;

  const metValue = met[intensity] ?? met.moderate ?? Object.values(met)[0];
  const caloriesBurned = Math.round(metValue * weightKg * (durationMinutes / 60));
  return { caloriesBurned, met: metValue, source };
}
