// Deterministic plateau detection — plain arithmetic on logged weight, no AI
// call needed just to answer "is this trending the right way".
const WINDOW_DAYS = 14;
const MIN_ENTRIES = 3;
const MIN_SPAN_DAYS = 7;
const NOISE_THRESHOLD_KG = 0.3; // ignore day-to-day water-weight-sized wobble

export function computePlateauStatus(profile, weightEntries) {
  const now = Date.now();
  const windowEntries = weightEntries
    .filter((e) => now - new Date(e.date).getTime() <= WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (windowEntries.length < MIN_ENTRIES) {
    return { status: "insufficient_data", windowDays: WINDOW_DAYS, entriesInWindow: windowEntries.length };
  }

  const first = windowEntries[0];
  const last = windowEntries[windowEntries.length - 1];
  const spanDays = (new Date(last.date) - new Date(first.date)) / (24 * 60 * 60 * 1000);
  if (spanDays < MIN_SPAN_DAYS) {
    return { status: "insufficient_data", windowDays: WINDOW_DAYS, entriesInWindow: windowEntries.length };
  }

  const changeKg = Math.round((last.value - first.value) * 10) / 10;
  const goal = profile?.goalWeightKg;
  const tryingToLose = goal != null && goal < first.value;
  const tryingToGain = goal != null && goal > first.value;

  let onTrack = true;
  if (tryingToLose) onTrack = changeKg <= -NOISE_THRESHOLD_KG;
  else if (tryingToGain) onTrack = changeKg >= NOISE_THRESHOLD_KG;

  return {
    status: onTrack ? "on_track" : "plateau",
    windowDays: WINDOW_DAYS,
    entriesInWindow: windowEntries.length,
    changeKg,
    firstWeightKg: first.value,
    lastWeightKg: last.value,
    goalWeightKg: goal ?? null,
    direction: tryingToLose ? "lose" : tryingToGain ? "gain" : "maintain",
  };
}

const RECENT_DAYS = 14;

function withinRecentDays(iso, days) {
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

// Shared by the /plateau/plan route and the "generate an alternative plan"
// chat tool — the factual summary of recent logs the AI grounds its
// alternative-approach suggestion in.
export function buildAlternativePlanContext(store, plateauStatus) {
  const recentFood = store.foodLog.filter((e) => withinRecentDays(e.at, RECENT_DAYS) && e.calories != null);
  const avgCalories = recentFood.length
    ? Math.round(recentFood.reduce((s, e) => s + e.calories, 0) / recentFood.length)
    : null;

  const recentActivity = store.activityLog.filter((e) => withinRecentDays(e.at, RECENT_DAYS));
  const totalActivityMinutes = recentActivity.reduce((s, e) => s + e.durationMinutes, 0);
  const avgActivityMinutesPerWeek = Math.round((totalActivityMinutes / RECENT_DAYS) * 7);

  const junkCount7d = store.foodLog.filter((e) => e.isJunkFood && withinRecentDays(e.at, 7)).length;

  const lines = [
    `Weight change over last ${plateauStatus.windowDays} days: ${plateauStatus.changeKg > 0 ? "+" : ""}${plateauStatus.changeKg} kg (from ${plateauStatus.firstWeightKg} kg to ${plateauStatus.lastWeightKg} kg), goal direction: ${plateauStatus.direction}.`,
    avgCalories != null
      ? `Average logged meal calories per entry over the last ${RECENT_DAYS} days: ~${avgCalories} kcal (from ${recentFood.length} logged meals — this is per-meal, not daily total, since not every meal may be logged).`
      : `No meals with calorie data logged in the last ${RECENT_DAYS} days.`,
    `Logged activity: ~${avgActivityMinutesPerWeek} minutes/week average over the last ${RECENT_DAYS} days (${recentActivity.length} sessions logged).`,
    `Junk food/sugary drink instances in the last 7 days: ${junkCount7d}.`,
  ];
  return lines.join("\n");
}
