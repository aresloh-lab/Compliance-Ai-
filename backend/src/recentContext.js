// A compact, deterministic summary of what the user has actually logged
// recently — folded into the coach's system prompt so it can reference real
// patterns ("you've been light on water this week") instead of only
// reasoning from static profile fields and whatever's in the chat window.
const DAYS = 7;

function withinDays(iso, days) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

export function buildRecentContext(store) {
  const lines = [];

  const recentFood = store.foodLog.filter((e) => withinDays(e.at, DAYS));
  if (recentFood.length) {
    const withCalories = recentFood.filter((e) => e.calories != null);
    const avgCalories = withCalories.length
      ? Math.round(withCalories.reduce((s, e) => s + e.calories, 0) / withCalories.length)
      : null;
    const junkCount = recentFood.filter((e) => e.isJunkFood).length;
    lines.push(
      `Meals logged in the last ${DAYS} days: ${recentFood.length}${avgCalories ? ` (avg ~${avgCalories} kcal/meal)` : ""}, of which ${junkCount} flagged as junk food/sugary drinks.`
    );

    const largePortions = recentFood.filter((e) => e.portionAssessment?.largerThanTypical).length;
    if (largePortions > 0) {
      lines.push(`Portion sizes flagged as larger than typical in ${largePortions} of those ${recentFood.length} meals.`);
    }

    const withPace = recentFood.filter((e) => e.eatingPace);
    if (withPace.length) {
      const quickCount = withPace.filter((e) => e.eatingPace === "quick").length;
      lines.push(`Self-reported eating pace (${withPace.length} meals): eaten quickly in ${quickCount} of them.`);
    }
    const withFullness = recentFood.filter((e) => e.fullnessLevel);
    if (withFullness.length) {
      const pastFullCount = withFullness.filter((e) => e.fullnessLevel === "ate_past_full").length;
      lines.push(`Self-reported fullness (${withFullness.length} meals): ate past comfortably full in ${pastFullCount} of them.`);
    }

    const companionLogged = recentFood.filter((e) => e.loggedBy === "companion").length;
    if (companionLogged > 0) {
      lines.push(`${companionLogged} of those meals were logged by the user's partner (shared-meal photos).`);
    }
  } else {
    lines.push(`No meals logged in the last ${DAYS} days.`);
  }

  const recentActivity = store.activityLog.filter((e) => withinDays(e.at, DAYS));
  const totalMinutes = recentActivity.reduce((s, e) => s + e.durationMinutes, 0);
  const totalBurned = recentActivity.reduce((s, e) => s + (e.caloriesBurned || 0), 0);
  lines.push(
    recentActivity.length
      ? `Activity in the last ${DAYS} days: ${recentActivity.length} session(s), ${totalMinutes} total minutes${totalBurned ? `, ~${totalBurned} kcal burned` : ""}.`
      : `No exercise/activity sessions logged in the last ${DAYS} days.`
  );

  const recentSteps = store.stepLog.filter((e) => withinDays(e.at, DAYS));
  if (recentSteps.length) {
    const avgSteps = Math.round(recentSteps.reduce((s, e) => s + e.steps, 0) / recentSteps.length);
    lines.push(`Average daily steps over the last ${recentSteps.length} logged day(s): ~${avgSteps}.`);
  }

  const recentWater = store.waterLog.filter((e) => withinDays(e.at, DAYS));
  if (recentWater.length) {
    const totalCups = recentWater.reduce((s, e) => s + e.cups, 0);
    lines.push(`Water logged in the last ${DAYS} days: ${totalCups} cups total.`);
  }

  const weightEntries = store.progressEntries
    .filter((e) => e.type === "weight" && withinDays(e.date, 30))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (weightEntries.length >= 2) {
    const first = weightEntries[0];
    const last = weightEntries[weightEntries.length - 1];
    const change = Math.round((last.value - first.value) * 10) / 10;
    lines.push(`Weight trend (last 30 days): ${first.value}kg -> ${last.value}kg (${change > 0 ? "+" : ""}${change}kg).`);
  }

  return lines.join("\n");
}
