// Shared deterministic goal-suggestion math. Extracted so the water/step
// routes and the companion summary (a partner viewing the same plan) always
// agree on the same numbers instead of each computing their own copy.

const ML_PER_KG = 33;
const ACTIVITY_BONUS_ML = { sedentary: 0, light: 200, moderate: 400, active: 600 };
const ML_PER_CUP = 240;
const MIN_CUPS = 4;
const MAX_CUPS = 16;

export function suggestedWaterCups(profile) {
  if (!profile?.weightKg) return 8;
  const ml = profile.weightKg * ML_PER_KG + (ACTIVITY_BONUS_ML[profile.activityLevel] ?? 0);
  const cups = Math.round(ml / ML_PER_CUP);
  return Math.max(MIN_CUPS, Math.min(MAX_CUPS, cups));
}

// Beginner-friendly starting points — deliberately easy, not a workout target.
const SUGGESTED_STEP_GOAL_BY_ACTIVITY = {
  sedentary: 3000,
  light: 5000,
  moderate: 7500,
  active: 10000,
};

export function suggestedStepGoal(profile) {
  return SUGGESTED_STEP_GOAL_BY_ACTIVITY[profile?.activityLevel] ?? 3000;
}
