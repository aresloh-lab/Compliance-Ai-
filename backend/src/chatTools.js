import { getStore, updateStore } from "./db.js";
import { createMessage, webSearchTool } from "./claude.js";
import {
  foodCheckSystemPrompt,
  mealAnalysisSystemPrompt,
  junkFoodPlanSystemPrompt,
  weightLossProgramSystemPrompt,
  planSystemPrompt,
  alternativePlanSystemPrompt,
} from "./prompts.js";
import { extractJson, aiErrorHint } from "./util.js";
import { buildRecentContext } from "./recentContext.js";
import { buildRepSet } from "./repCounter.js";
import { buildProgramPlan } from "./weightLossProgram.js";
import { computePlateauStatus, buildAlternativePlanContext } from "./plateau.js";
import { computeRewardsSummary } from "./rewards.js";
import { estimateCaloriesBurned } from "./calorieBurn.js";
import { generateShareCode } from "./companionCode.js";
import { performGoogleFitSync } from "./googleFit.js";
import { performGoogleDriveBackup } from "./googleDrive.js";

// Tools the coach can call mid-conversation so "just talk to it" genuinely
// operates the app, not only gives advice. Two kinds:
//  - "server" tools do something real against the store right here and
//    return a text result Claude uses to phrase its reply.
//  - "client" tools can't be executed on the backend at all (switching a UI
//    tab, starting a client-side timer, triggering a browser download) — we
//    acknowledge them so Claude can finish its turn, and pass them back to
//    the frontend as an `actions[]` list to actually perform. A few tools
//    below are hybrid — they do real server-side work AND ask the frontend
//    to switch tabs afterward so the user can see the result — those aren't
//    listed here since this set exists only to document the pure-client ones.
export const CLIENT_ACTION_TOOLS = new Set([
  "navigate_to_tab",
  "start_workout_timer",
  "export_my_data",
  "start_rep_counter",
  "start_tabata_timer",
  "start_video_exercise_coach",
  "connect_google_fit",
  "connect_google_drive",
]);

// Must stay in sync with the `id`s in App.jsx's TABS array — a name here
// that doesn't match a real tab silently blanks the page (setTab to a
// nonexistent id matches none of App.jsx's tab-content conditionals),
// confirmed live when "program"/"junk" (stale names from an older,
// more-granular tab layout) were still in use below.
const TAB_IDS = ["dashboard", "coach", "food", "activity", "water", "plan", "progress", "profile"];
const INTENSITIES = new Set(["light", "moderate", "vigorous"]);
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const SUPPLEMENT_CATEGORIES = new Set(["probiotic", "vitaminC", "enzyme", "multivitamin", "fiber", "omega3", "other"]);
const MEASUREMENT_TYPES = new Set(["bloodPressure", "glucose", "uricAcid"]);

export const TOOL_DEFINITIONS = [
  {
    name: "navigate_to_tab",
    description:
      "Switch the app to a specific tab so the user can see or use that feature. Use whenever the user asks to see, open, go to, or use a specific part of the app (e.g. 'show me my progress', 'open the food diary').",
    input_schema: {
      type: "object",
      properties: {
        tab: { type: "string", enum: TAB_IDS, description: "Which tab to switch to." },
      },
      required: ["tab"],
    },
  },
  {
    name: "start_workout_timer",
    description:
      "Start the live start/stop workout timer for an activity the user says they're beginning right now (e.g. 'I'm starting swimming now'). Switches to the Activity tab and starts timing immediately — duration and calories are captured automatically when they later say they're done.",
    input_schema: {
      type: "object",
      properties: {
        activityType: { type: "string", description: "The activity, e.g. swimming, running, cycling." },
        intensity: { type: "string", enum: ["light", "moderate", "vigorous"], description: "Best guess if not stated; default moderate." },
      },
      required: ["activityType"],
    },
  },
  {
    name: "start_rep_counter",
    description:
      "Pace the user through a set of a specific countable-rep bodyweight exercise right now (e.g. 'let's do push-ups', 'I'm doing squats now', 'give me sit-ups') — a paced, counted rep-by-rep display with voice cues, not the open-ended stopwatch. Prefer this over start_workout_timer whenever the exercise is a countable rep-based movement (push-ups, squats, sit-ups, lunges, jumping jacks, burpees, mountain climbers, high knees, calf raises, glute bridges, etc).",
    input_schema: {
      type: "object",
      properties: {
        exerciseType: { type: "string", description: "The exercise, e.g. push-ups, squats, sit-ups." },
      },
      required: ["exerciseType"],
    },
  },
  {
    name: "start_tabata_timer",
    description:
      "Start a structured Tabata interval session (20s work / 10s rest rounds) right now. Prefer this over start_workout_timer whenever the user specifically says tabata or asks for an interval/HIIT session with rest periods.",
    input_schema: {
      type: "object",
      properties: {
        exerciseType: { type: "string", description: "What they're doing during work intervals, e.g. burpees, jumping jacks. Default to a generic 'tabata' if not stated." },
        rounds: { type: "number", description: "Number of work/rest rounds; default 8 if not stated." },
      },
    },
  },
  {
    name: "start_video_exercise_coach",
    description:
      "Open the AI camera-based rep counter, which watches the user's body through their camera and counts reps live by tracking joint angles (currently supports sit-ups, push-ups, squats) — more accurate than the plain rep counter since it's based on their actual movement, not an assumed pace. Use when the user specifically wants their camera/video used to track an exercise, e.g. 'watch me do sit-ups', 'use the camera to count my push-ups'. The user still has to tap 'Enable camera' themselves — browsers require a direct tap for camera permission, it can't be started for them.",
    input_schema: {
      type: "object",
      properties: {
        exerciseType: { type: "string", enum: ["situp", "pushup", "squat"], description: "Which exercise to pre-select." },
      },
      required: ["exerciseType"],
    },
  },
  {
    name: "export_my_data",
    description:
      "Trigger a download of all the user's app data as a backup file. Use when they ask to export, download, back up, or transfer their data — including when they say they're switching/changing phones and want to keep their data.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_water",
    description: "Log water intake for today. Use when the user says they drank water, e.g. 'log a cup of water', 'I just had 2 glasses'.",
    input_schema: {
      type: "object",
      properties: { cups: { type: "number", description: "Number of cups; default 1 if not stated." } },
    },
  },
  {
    name: "log_weight",
    description: "Log today's body weight when the user states a current weight to be recorded, e.g. 'log my weight as 78 kilos'.",
    input_schema: {
      type: "object",
      properties: { weightKg: { type: "number", description: "Weight in kilograms." } },
      required: ["weightKg"],
    },
  },
  {
    name: "get_app_data_summary",
    description:
      "Get a factual summary of the user's logged data (profile basics, how many meals/activities logged, weight trend) so you can accurately answer questions like 'what's my current data' or 'how much have I logged so far' or 'generate my data for me'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_activity_entry",
    description:
      "Log a physical activity the user already completed (not starting a live timer) — e.g. 'log that I did 30 minutes of basketball', 'I swam for 45 minutes, vigorous'. Calories burned are estimated automatically.",
    input_schema: {
      type: "object",
      properties: {
        activityType: { type: "string", description: "e.g. basketball, a swim, gym workout." },
        durationMinutes: { type: "number", description: "How long, in minutes." },
        intensity: { type: "string", enum: ["light", "moderate", "vigorous"], description: "Best guess if not stated; default moderate." },
      },
      required: ["activityType", "durationMinutes"],
    },
  },
  {
    name: "log_steps",
    description:
      "Log today's total step count, e.g. 'I walked 8000 steps today'. Overwrites any existing step count already logged for today (a step count is a running daily total, not a discrete event).",
    input_schema: {
      type: "object",
      properties: { steps: { type: "number", description: "Today's total step count." } },
      required: ["steps"],
    },
  },
  {
    name: "set_step_goal",
    description: "Set the user's daily step goal, e.g. 'set my step goal to 6000'.",
    input_schema: {
      type: "object",
      properties: { goal: { type: "number", description: "Daily step goal." } },
      required: ["goal"],
    },
  },
  {
    name: "set_water_goal",
    description: "Set the user's daily water intake goal in cups, e.g. 'set my water goal to 10 cups a day'.",
    input_schema: {
      type: "object",
      properties: { goalCups: { type: "number", description: "Daily water goal in cups." } },
      required: ["goalCups"],
    },
  },
  {
    name: "add_supplement",
    description: "Log a supplement or healthy addition the user took, e.g. 'log that I took vitamin C 500mg' or 'I had a probiotic yogurt'.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["probiotic", "vitaminC", "enzyme", "multivitamin", "fiber", "omega3", "other"], description: "Best-matching category." },
        name: { type: "string", description: "e.g. Greek yogurt, Vitamin C 500mg." },
        dosage: { type: "string", description: "e.g. 500mg, 1 capsule. Optional." },
      },
      required: ["category", "name"],
    },
  },
  {
    name: "log_health_measurement",
    description:
      "Log a health measurement other than weight — blood pressure, blood glucose, or uric acid — when the user states a reading, e.g. 'my blood pressure was 120 over 80' or 'my glucose was 95'.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["bloodPressure", "glucose", "uricAcid"] },
        value: { type: "number", description: "The reading, for glucose/uricAcid (mg/dL)." },
        systolic: { type: "number", description: "Required for bloodPressure." },
        diastolic: { type: "number", description: "Required for bloodPressure." },
      },
      required: ["type"],
    },
  },
  {
    name: "check_food",
    description:
      "Give a quick 'should I eat this' verdict on a specific food the user is considering, factoring in their profile and health conditions, e.g. 'can I eat a slice of pizza' or 'should I have bubble tea today'. This only gives advice — use log_meal_from_description instead when they want it actually logged.",
    input_schema: {
      type: "object",
      properties: { description: { type: "string", description: "What they're considering eating." } },
      required: ["description"],
    },
  },
  {
    name: "log_meal_from_description",
    description:
      "Analyze and log a meal the user describes in words (no photo) to their food diary, e.g. 'log my lunch — grilled chicken, rice, and broccoli'. Use this to actually record a meal; use check_food instead when they're only asking for advice before eating.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What they ate." },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Best guess from context or time of day if not stated." },
      },
      required: ["description", "mealType"],
    },
  },
  {
    name: "get_rewards_balance",
    description: "Check the user's treat-credit balance and any junk-food 'debt' from the penalty/reward system, e.g. 'can I have a treat', 'how many credits do I have'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "redeem_reward",
    description: "Redeem one earned treat credit, e.g. 'redeem a treat credit', 'use one of my credits'. Only works if a credit is available.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_daily_plan",
    description: "Generate today's one-day meal and light-exercise plan, e.g. 'give me a plan for today', 'what should I eat today'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_weight_loss_program",
    description:
      "Generate (or regenerate) the user's structured weight-loss program — pace, calorie target, and daily indoor exercise plan. Requires a goal weight to already be set in their profile. Use a difficulty (easy/normal/hard) if they state a pace preference, or a target number of days if they state a deadline.",
    input_schema: {
      type: "object",
      properties: {
        difficulty: { type: "string", enum: ["easy", "normal", "hard"] },
        targetDays: { type: "number", description: "Target number of days to reach their goal, if stated instead of a difficulty." },
      },
    },
  },
  {
    name: "generate_junk_food_plan",
    description:
      "Generate a gradual junk-food/sugary-drink reduction plan, e.g. 'help me cut down on soda', 'make me a junk food reduction plan'. Ask how many times a week they currently have junk food/sugary drinks if not stated.",
    input_schema: {
      type: "object",
      properties: { baselinePerWeek: { type: "number", description: "Roughly how many junk food/sugary drink instances per week currently." } },
      required: ["baselinePerWeek"],
    },
  },
  {
    name: "check_plateau_status",
    description: "Check whether the user's weight trend is on track or has plateaued, based on their logged weight history, e.g. 'am I plateauing', 'is my weight loss stalling'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_alternative_plan",
    description:
      "Generate an alternative approach when the user's weight trend has plateaued or isn't moving the right direction, based on their actual recent logged data. Use after check_plateau_status confirms a plateau, or when the user directly asks for a new approach because what they're doing isn't working.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "enable_companion_sharing",
    description:
      "Turn on sharing the user's daily plan with their partner and generate a share code, e.g. 'let my wife see my plan', 'share my progress with my girlfriend'. Read the resulting code back to them clearly so they can pass it along.",
    input_schema: {
      type: "object",
      properties: { partnerLabel: { type: "string", description: "The partner's name, if given. Optional." } },
    },
  },
  {
    name: "sync_google_fit",
    description: "Pull in the latest steps and workouts from Google Fit, e.g. 'sync my Google Fit', 'import my steps from Google Fit'. Only works if Google Fit is already connected — if not, use connect_google_fit instead.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "backup_to_google_drive",
    description: "Back up all app data to the user's connected Google Drive right now, e.g. 'back up my data to Drive'. Only works if Google Drive is already connected — if not, use connect_google_drive instead.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "connect_google_fit",
    description: "Open the flow to connect the user's Google Fit account, e.g. 'connect Google Fit', 'link my Google Fit'. Requires the user to sign in with Google in the browser.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "connect_google_drive",
    description: "Open the flow to connect the user's Google Drive account for automatic backups, e.g. 'connect Google Drive', 'set up Drive backup'. Requires the user to sign in with Google in the browser.",
    input_schema: { type: "object", properties: {} },
  },
];

async function logWater(input) {
  const cups = Number(input.cups) > 0 ? Number(input.cups) : 1;
  const entry = { id: Date.now(), at: new Date().toISOString(), cups };
  await updateStore((s) => {
    s.waterLog.push(entry);
  });
  return `Logged ${cups} cup(s) of water for today.`;
}

async function logWeight(input) {
  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return "That didn't look like a valid weight — ask the user to restate it in kilograms.";
  }
  const entry = { id: Date.now(), date: new Date().toISOString(), type: "weight", value: weightKg, unit: "kg", source: "manual", note: "" };
  await updateStore((s) => {
    s.progressEntries.push(entry);
    s.progressEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
  });
  return `Logged today's weight as ${weightKg} kg.`;
}

async function getAppDataSummary() {
  const store = await getStore();
  const p = store.profile;
  const weightEntries = store.progressEntries.filter((e) => e.type === "weight");
  const latestWeight = weightEntries[weightEntries.length - 1];
  const firstWeight = weightEntries[0];
  const junkCount7d = store.foodLog.filter(
    (e) => e.isJunkFood && Date.now() - new Date(e.at).getTime() <= 7 * 24 * 60 * 60 * 1000
  ).length;

  const lines = [
    `Name: ${p?.name ?? "not set"}, current weight: ${p?.weightKg ?? "?"}kg, goal weight: ${p?.goalWeightKg ?? "not set"}kg.`,
    `Meals logged (all time): ${store.foodLog.length}.`,
    `Activity sessions logged (all time): ${store.activityLog.length}.`,
    `Weight readings logged: ${weightEntries.length}${
      weightEntries.length >= 2 ? ` (from ${firstWeight.value}kg to ${latestWeight.value}kg)` : ""
    }.`,
    `Water log entries: ${store.waterLog.length}. Supplement entries: ${store.supplementLog.length}.`,
    `Junk food/sugary drink instances in the last 7 days: ${junkCount7d}.`,
  ];
  return lines.join("\n");
}

async function logActivityEntry(input) {
  const activityType = (input.activityType || "").trim();
  const durationMinutes = Number(input.durationMinutes);
  if (!activityType) return "No activity given — ask the user what they did.";
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return "That didn't look like a valid duration — ask the user how many minutes.";
  }
  const intensity = INTENSITIES.has(input.intensity) ? input.intensity : "moderate";
  const store = await getStore();
  const estimate = await estimateCaloriesBurned({
    activityType,
    durationMinutes,
    intensity,
    weightKg: store.profile?.weightKg,
  }).catch(() => null);
  const entry = {
    id: Date.now(),
    at: new Date().toISOString(),
    activityType,
    durationMinutes,
    intensity,
    note: "Logged via chat",
    source: "manual",
    caloriesBurned: estimate?.caloriesBurned ?? null,
    calorieEstimateSource: estimate?.source ?? null,
  };
  await updateStore((s) => {
    s.activityLog.push(entry);
  });
  return `Logged ${durationMinutes} min of ${activityType} (${intensity})${entry.caloriesBurned != null ? `, ~${entry.caloriesBurned} kcal burned` : ""}.`;
}

async function logSteps(input) {
  const steps = Number(input.steps);
  if (!Number.isFinite(steps) || steps < 0) return "That didn't look like a valid step count.";
  const day = new Date().toISOString().slice(0, 10);
  await updateStore((s) => {
    const existing = s.stepLog.find((e) => e.date === day);
    if (existing) {
      existing.steps = steps;
      existing.source = "manual";
      existing.at = new Date().toISOString();
    } else {
      s.stepLog.push({ id: Date.now(), date: day, steps, source: "manual", at: new Date().toISOString() });
    }
  });
  return `Logged ${steps} steps for today.`;
}

async function setStepGoal(input) {
  const goal = Number(input.goal);
  if (!Number.isFinite(goal) || goal <= 0) return "That didn't look like a valid step goal.";
  await updateStore((s) => {
    s.stepGoal = goal;
  });
  return `Set the daily step goal to ${goal}.`;
}

async function setWaterGoal(input) {
  const goalCups = Number(input.goalCups);
  if (!Number.isFinite(goalCups) || goalCups <= 0) return "That didn't look like a valid water goal.";
  await updateStore((s) => {
    s.waterSettings.dailyGoalCups = goalCups;
  });
  return `Set the daily water goal to ${goalCups} cups.`;
}

async function addSupplementEntry(input) {
  const category = SUPPLEMENT_CATEGORIES.has(input.category) ? input.category : "other";
  const name = (input.name || "").trim();
  if (!name) return "No supplement/food name given — ask the user what they took.";
  const entry = { id: Date.now(), at: new Date().toISOString(), category, name, dosage: input.dosage || "", note: "" };
  await updateStore((s) => {
    s.supplementLog.push(entry);
  });
  return `Logged ${name}${input.dosage ? ` (${input.dosage})` : ""}.`;
}

async function logHealthMeasurement(input) {
  const type = input.type;
  if (!MEASUREMENT_TYPES.has(type)) {
    return "Not a recognized measurement type — ask the user to clarify (blood pressure, glucose, or uric acid).";
  }
  let entry;
  if (type === "bloodPressure") {
    const systolic = Number(input.systolic);
    const diastolic = Number(input.diastolic);
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
      return "Need both systolic and diastolic numbers for a blood pressure reading.";
    }
    entry = { type, systolic, diastolic, unit: "mmHg", source: "manual", note: "" };
  } else {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return "That didn't look like a valid reading.";
    entry = { type, value, unit: "mg/dL", source: "manual", note: "" };
  }
  const record = { id: Date.now(), date: new Date().toISOString(), ...entry };
  await updateStore((s) => {
    s.progressEntries.push(record);
    s.progressEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
  });
  return type === "bloodPressure"
    ? `Logged blood pressure: ${entry.systolic}/${entry.diastolic} mmHg.`
    : `Logged ${type}: ${entry.value} mg/dL.`;
}

async function checkFood(input) {
  const description = (input.description || "").trim();
  if (!description) return "No food given to check — ask the user what they're considering.";
  const store = await getStore();
  try {
    return await createMessage({
      system: foodCheckSystemPrompt(store.profile, buildRecentContext(store)),
      messages: [{ role: "user", content: `Should I eat this? ${description}` }],
      maxTokens: 800,
      tools: [webSearchTool(2)],
    });
  } catch (err) {
    return `Couldn't get advice on that right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
}

async function logMealFromDescription(input) {
  const description = (input.description || "").trim();
  const mealType = MEAL_TYPES.has(input.mealType) ? input.mealType : "snack";
  if (!description) return "No meal description given — ask the user what they ate.";
  const store = await getStore();
  let analysis;
  try {
    const raw = await createMessage({
      system: mealAnalysisSystemPrompt(store.profile),
      messages: [{ role: "user", content: `Meal description: ${description}` }],
      maxTokens: 2500,
      tools: [webSearchTool(3)],
    });
    analysis = extractJson(raw);
  } catch (err) {
    return `Couldn't analyze that meal right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
  const entry = {
    id: Date.now(),
    at: new Date().toISOString(),
    mealType,
    summary: description,
    calories: analysis.totalCalories ?? null,
    macroBalance: analysis.macroBalance ?? null,
    photoDataUrl: null,
    isJunkFood: Boolean(analysis.containsJunkFood),
    junkFoodItems: analysis.junkFoodItems ?? [],
    portionAssessment: analysis.portionAssessment ?? null,
    eatingPace: null,
    fullnessLevel: null,
    loggedBy: "user",
  };
  await updateStore((s) => {
    s.foodLog.push(entry);
  });
  return `Logged ${mealType}: ${description}${entry.calories != null ? ` (~${entry.calories} kcal)` : ""}.${entry.isJunkFood ? " Flagged as junk food/sugary drink." : ""}`;
}

async function getRewardsBalanceText() {
  const store = await getStore();
  const s = computeRewardsSummary(store);
  const status = s.outstandingDebtMinutes > 0
    ? `No treat credits available right now — about ${s.outstandingDebtMinutes} minutes of extra light activity behind, from ${s.junkCount} junk food/drink instance(s) in the last ${s.windowDays} days.`
    : `${s.availableCredits} treat credit(s) available (each covers ${s.rules.treatPortionNote}). ${s.activityMinutes} extra activity minutes logged in the last ${s.windowDays} days.`;
  // Spelled out explicitly (not left for the model to infer/guess) since a
  // user asking "how do I earn more" needs the actual rule, and the model
  // has no other source for it — without this, some models fabricate a
  // plausible-sounding but wrong mechanism (confirmed live: Gemini invented
  // "hitting your step/water goals" as the earning criteria when this text
  // only reported the current balance).
  const rule = `How credits work: logging ${s.rules.creditMinutes} minutes of extra physical activity earns 1 treat credit (each junk food/sugary drink instance in the last ${s.windowDays} days costs ${s.rules.junkDebtMinutes} minutes off that first), capped at ${s.rules.maxBankedCredits} banked credits at a time. Only logged activity and junk food count toward this — nothing else.`;
  return `${status} ${rule}`;
}

async function redeemRewardCredit() {
  const store = await getStore();
  const summary = computeRewardsSummary(store);
  if (summary.availableCredits <= 0) {
    return `No treat credits available yet — log extra activity to earn one (${summary.rules.creditMinutes} min = 1 credit).`;
  }
  await updateStore((s) => {
    s.rewardRedemptions.push({ id: Date.now(), at: new Date().toISOString() });
  });
  return `Redeemed a treat credit — ${summary.rules.treatPortionNote}.`;
}

async function generateDailyPlanText() {
  const store = await getStore();
  if (!store.profile) return "No profile set up yet — ask the user to complete registration first.";
  try {
    const raw = await createMessage({
      system: planSystemPrompt(store.profile),
      messages: [{ role: "user", content: "Generate today's meal and exercise plan." }],
      maxTokens: 2200,
      tools: [webSearchTool(2)],
    });
    const plan = { ...extractJson(raw), generatedAt: new Date().toISOString() };
    await updateStore((s) => {
      s.dailyPlan = plan;
    });
    const meals = (plan.meals || []).map((m) => `${m.name}: ${(m.items || []).join(", ")}`).join("; ");
    return `Today's plan (~${plan.estimatedCalorieTarget} kcal): ${meals}. Exercise: ${plan.exercise?.summary ?? "none"}.`;
  } catch (err) {
    return `Couldn't generate a plan right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
}

async function generateWeightLossProgramTool(input) {
  const store = await getStore();
  if (!store.profile) return "No profile set up yet — ask the user to complete registration first.";
  if (!store.profile.goalWeightKg) return "No goal weight set yet — ask the user to set one in their profile first.";
  const hasDifficulty = ["easy", "normal", "hard"].includes(input.difficulty);
  const hasDays = Number.isFinite(Number(input.targetDays)) && Number(input.targetDays) > 0;
  if (!hasDifficulty && !hasDays) {
    return "Need either a difficulty (easy/normal/hard) or a target number of days — ask the user which they'd prefer.";
  }
  const computed = buildProgramPlan(store.profile, {
    difficulty: hasDifficulty ? input.difficulty : null,
    targetDays: hasDifficulty ? null : Number(input.targetDays),
  });
  if (computed.status === "already_at_goal") {
    return "Their goal weight isn't below their current weight, so there's no program to build — mention this to the user.";
  }
  try {
    const raw = await createMessage({
      system: weightLossProgramSystemPrompt(store.profile, computed),
      messages: [{ role: "user", content: "Generate my program." }],
      maxTokens: 3000,
    });
    const aiContent = extractJson(raw);
    const program = { ...computed, ...aiContent, generatedAt: new Date().toISOString() };
    await updateStore((s) => {
      s.weightLossProgram = program;
    });
    return `Generated a ${program.difficulty} weight-loss program: ~${program.dailyCalorieTarget} kcal/day, aiming for ${program.effectiveRateKgPerWeek}kg/week (about ${program.estimatedWeeks} weeks to goal).`;
  } catch (err) {
    return `Couldn't generate the program right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
}

async function generateJunkFoodPlanTool(input) {
  const store = await getStore();
  if (!store.profile) return "No profile set up yet — ask the user to complete registration first.";
  const baselinePerWeek = Number(input.baselinePerWeek);
  if (!Number.isFinite(baselinePerWeek) || baselinePerWeek < 0) {
    return "Need a rough weekly junk food/sugary drink count — ask the user.";
  }
  try {
    const raw = await createMessage({
      system: junkFoodPlanSystemPrompt(store.profile, baselinePerWeek),
      messages: [{ role: "user", content: "Generate my gradual reduction plan." }],
      maxTokens: 1800,
    });
    const plan = extractJson(raw);
    await updateStore((s) => {
      s.junkFoodPlan = { ...plan, generatedAt: new Date().toISOString() };
    });
    return `Generated a gradual junk-food reduction plan starting from ~${baselinePerWeek}/week.`;
  } catch (err) {
    return `Couldn't generate that plan right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
}

async function checkPlateauStatusText() {
  const store = await getStore();
  const weightEntries = store.progressEntries.filter((e) => e.type === "weight");
  const status = computePlateauStatus(store.profile, weightEntries);
  if (status.status === "insufficient_data") {
    return "Not enough weight history yet to judge a trend — need at least 3 readings spanning a week or more.";
  }
  if (status.status === "on_track") {
    return `On track: weight moved from ${status.firstWeightKg}kg to ${status.lastWeightKg}kg (${status.changeKg}kg) over the last ${status.windowDays} days, in the right direction.`;
  }
  return `Looks like a plateau: weight moved from ${status.firstWeightKg}kg to ${status.lastWeightKg}kg (${status.changeKg}kg) over the last ${status.windowDays} days — not much net movement toward the goal. Consider offering to generate an alternative plan.`;
}

async function generateAlternativePlanTool() {
  const store = await getStore();
  if (!store.profile) return "No profile set up yet — ask the user to complete registration first.";
  const weightEntries = store.progressEntries.filter((e) => e.type === "weight");
  const plateauStatus = computePlateauStatus(store.profile, weightEntries);
  if (plateauStatus.status === "insufficient_data") {
    return "Not enough weight history yet — need at least 3 readings spanning a week or more before an alternative plan makes sense.";
  }
  const dataContext = buildAlternativePlanContext(store, plateauStatus);
  try {
    const raw = await createMessage({
      system: alternativePlanSystemPrompt(store.profile, dataContext),
      messages: [{ role: "user", content: "Give me an alternative approach based on my recent data." }],
      maxTokens: 2000,
    });
    const plan = extractJson(raw);
    await updateStore((s) => {
      s.alternativePlan = { ...plan, generatedAt: new Date().toISOString(), basedOn: plateauStatus };
    });
    return "Generated an alternative approach based on your recent logged data — see the Progress tab for the full breakdown.";
  } catch (err) {
    return `Couldn't generate an alternative plan right now — ask the user to try again in a moment.${aiErrorHint(err)}`;
  }
}

async function enableCompanionSharing(input) {
  const partnerLabel = (input.partnerLabel || "").trim();
  const code = generateShareCode();
  await updateStore((s) => {
    s.companion.enabled = true;
    s.companion.code = code;
    s.companion.partnerLabel = partnerLabel || s.companion.partnerLabel || "";
    s.companion.createdAt = new Date().toISOString();
  });
  return `Sharing turned on. Share code: ${code} — read this back to the user clearly so they can pass it to their partner (also visible anytime in Profile > Share with your partner).`;
}

async function syncGoogleFitTool() {
  const store = await getStore();
  if (!store.googleFit?.connected) {
    return "Google Fit isn't connected yet — the user needs to connect it first (I can open that for them).";
  }
  try {
    const result = await performGoogleFitSync(store, updateStore);
    return `Synced Google Fit: ${result.daysUpdated} day(s) of steps updated, ${result.activitiesImported} new activity session(s) imported.`;
  } catch (err) {
    return `Google Fit sync failed: ${err.message}`;
  }
}

async function backupToGoogleDriveTool() {
  const store = await getStore();
  if (!store.googleDrive?.connected) {
    return "Google Drive isn't connected yet — the user needs to connect it first (I can open that for them).";
  }
  try {
    await performGoogleDriveBackup(store, updateStore);
    return "Backed up all data to Google Drive.";
  } catch (err) {
    return `Google Drive backup failed: ${err.message}`;
  }
}

// Server tools execute now and return a text result for Claude to use.
// Client-action tools return an acknowledgement only — the real effect
// happens in the browser via the `actions[]` list returned to chat.js's caller.
export async function executeTool(name, input) {
  switch (name) {
    case "log_water":
      return { resultText: await logWater(input), isClientAction: false };
    case "log_weight":
      return { resultText: await logWeight(input), isClientAction: false };
    case "get_app_data_summary":
      return { resultText: await getAppDataSummary(), isClientAction: false };
    case "log_activity_entry":
      return { resultText: await logActivityEntry(input), isClientAction: false };
    case "log_steps":
      return { resultText: await logSteps(input), isClientAction: false };
    case "set_step_goal":
      return { resultText: await setStepGoal(input), isClientAction: false };
    case "set_water_goal":
      return { resultText: await setWaterGoal(input), isClientAction: false };
    case "add_supplement":
      return { resultText: await addSupplementEntry(input), isClientAction: false };
    case "log_health_measurement":
      return { resultText: await logHealthMeasurement(input), isClientAction: false };
    case "check_food":
      return { resultText: await checkFood(input), isClientAction: false };
    case "log_meal_from_description":
      return { resultText: await logMealFromDescription(input), isClientAction: false };
    case "get_rewards_balance":
      return { resultText: await getRewardsBalanceText(), isClientAction: false };
    case "redeem_reward":
      return { resultText: await redeemRewardCredit(), isClientAction: false };
    case "generate_daily_plan":
      return { resultText: await generateDailyPlanText(), isClientAction: false };
    case "check_plateau_status":
      return { resultText: await checkPlateauStatusText(), isClientAction: false };
    case "sync_google_fit":
      return { resultText: await syncGoogleFitTool(), isClientAction: false };
    case "backup_to_google_drive":
      return { resultText: await backupToGoogleDriveTool(), isClientAction: false };

    case "generate_weight_loss_program":
      return {
        resultText: await generateWeightLossProgramTool(input),
        isClientAction: true,
        action: { type: "navigate_to_tab", tab: "plan" },
      };
    case "generate_junk_food_plan":
      return {
        resultText: await generateJunkFoodPlanTool(input),
        isClientAction: true,
        action: { type: "navigate_to_tab", tab: "food" },
      };
    case "generate_alternative_plan":
      return {
        resultText: await generateAlternativePlanTool(),
        isClientAction: true,
        action: { type: "navigate_to_tab", tab: "progress" },
      };
    case "enable_companion_sharing":
      return {
        resultText: await enableCompanionSharing(input),
        isClientAction: true,
        action: { type: "navigate_to_tab", tab: "profile" },
      };

    case "navigate_to_tab":
      return { resultText: `Switched to the ${input.tab} tab.`, isClientAction: true, action: { type: "navigate_to_tab", tab: input.tab } };
    case "start_workout_timer":
      return {
        resultText: `Started the workout timer for ${input.activityType}.`,
        isClientAction: true,
        action: { type: "start_workout_timer", activityType: input.activityType, intensity: input.intensity || "moderate" },
      };
    case "export_my_data":
      return { resultText: "Started the data export download.", isClientAction: true, action: { type: "export_my_data" } };
    case "start_rep_counter": {
      const store = await getStore();
      const set = await buildRepSet({ exerciseType: input.exerciseType, profile: store.profile });
      return {
        resultText: `Started a paced set of ${set.reps} ${set.exerciseType}s.`,
        isClientAction: true,
        action: { type: "start_rep_counter", ...set },
      };
    }
    case "start_tabata_timer":
      return {
        resultText: `Started a Tabata session (${input.rounds || 8} rounds) for ${input.exerciseType || "tabata"}.`,
        isClientAction: true,
        action: {
          type: "start_tabata_timer",
          exerciseType: input.exerciseType || "tabata",
          rounds: Number(input.rounds) > 0 ? Number(input.rounds) : 8,
        },
      };
    case "start_video_exercise_coach": {
      const exerciseType = ["situp", "pushup", "squat"].includes(input.exerciseType) ? input.exerciseType : "situp";
      return {
        resultText: `Opened the camera exercise tracker for ${exerciseType}s — the user needs to tap "Enable camera" themselves.`,
        isClientAction: true,
        action: { type: "start_video_exercise_coach", exerciseType },
      };
    }
    case "connect_google_fit":
      return { resultText: "Opened the Google Fit connection flow.", isClientAction: true, action: { type: "connect_google_fit" } };
    case "connect_google_drive":
      return { resultText: "Opened the Google Drive connection flow.", isClientAction: true, action: { type: "connect_google_drive" } };
    default:
      return { resultText: `Unknown tool: ${name}`, isClientAction: false };
  }
}
