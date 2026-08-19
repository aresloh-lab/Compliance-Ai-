// Deterministic pace + calorie-target math — the safety-critical numbers
// (calorie floor, max safe weekly rate) are computed here, not left to the
// model, the same way steps/water/plateau math is handled elsewhere.

const RATE_BY_DIFFICULTY_KG_PER_WEEK = { easy: 0.25, normal: 0.5, hard: 0.75 };
const MAX_SAFE_RATE_KG_PER_WEEK = 1.0; // beyond this we cap and flag, regardless of what was requested
const KCAL_PER_KG_FAT = 7700;
const ACTIVITY_MULTIPLIER = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
const CALORIE_FLOOR = { male: 1500, female: 1200, other: 1200 };

function bmr({ weightKg, heightCm, age, gender }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") return base + 5;
  if (gender === "female") return base - 161;
  return base - 78; // midpoint, used when gender is "other"
}

function classifyRate(rateKgPerWeek) {
  if (rateKgPerWeek <= RATE_BY_DIFFICULTY_KG_PER_WEEK.easy + 0.05) return "easy";
  if (rateKgPerWeek <= RATE_BY_DIFFICULTY_KG_PER_WEEK.normal + 0.05) return "normal";
  return "hard";
}

export function buildProgramPlan(profile, { difficulty, targetDays }) {
  const { weightKg, goalWeightKg, heightCm, age, gender, activityLevel } = profile;
  const totalToLoseKg = Math.round((weightKg - goalWeightKg) * 10) / 10;

  if (totalToLoseKg <= 0) {
    return { status: "already_at_goal", totalToLoseKg };
  }

  let requestedRateKgPerWeek;
  let requestedDays = targetDays;
  if (difficulty) {
    requestedRateKgPerWeek = RATE_BY_DIFFICULTY_KG_PER_WEEK[difficulty];
    requestedDays = Math.round((totalToLoseKg / requestedRateKgPerWeek) * 7);
  } else {
    requestedRateKgPerWeek = totalToLoseKg / (targetDays / 7);
  }

  const maintenanceCalories = Math.round(bmr({ weightKg, heightCm, age, gender }) * (ACTIVITY_MULTIPLIER[activityLevel] ?? 1.2));
  const calorieFloor = CALORIE_FLOOR[gender] ?? CALORIE_FLOOR.other;

  let effectiveRateKgPerWeek = Math.min(requestedRateKgPerWeek, MAX_SAFE_RATE_KG_PER_WEEK);
  let dailyDeficit = Math.round((effectiveRateKgPerWeek * KCAL_PER_KG_FAT) / 7);
  let dailyCalorieTarget = maintenanceCalories - dailyDeficit;

  let paceAdjustedForSafety = effectiveRateKgPerWeek < requestedRateKgPerWeek;

  if (dailyCalorieTarget < calorieFloor) {
    dailyDeficit = Math.max(0, maintenanceCalories - calorieFloor);
    dailyCalorieTarget = maintenanceCalories - dailyDeficit;
    effectiveRateKgPerWeek = Math.round(((dailyDeficit * 7) / KCAL_PER_KG_FAT) * 100) / 100;
    paceAdjustedForSafety = true;
  }

  const estimatedWeeks = Math.round((totalToLoseKg / effectiveRateKgPerWeek) * 10) / 10;
  const estimatedDays = Math.round(estimatedWeeks * 7);

  return {
    status: "ok",
    totalToLoseKg,
    requestedRateKgPerWeek: Math.round(requestedRateKgPerWeek * 100) / 100,
    requestedDays,
    effectiveRateKgPerWeek,
    difficulty: classifyRate(effectiveRateKgPerWeek),
    paceAdjustedForSafety,
    maintenanceCalories,
    dailyDeficit,
    dailyCalorieTarget,
    calorieFloor,
    estimatedWeeks,
    estimatedDays,
  };
}
