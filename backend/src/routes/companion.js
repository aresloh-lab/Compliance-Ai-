import { Router } from "express";
import multer from "multer";
import { getStore, updateStore } from "../db.js";
import { createMessage, webSearchTool } from "../claude.js";
import { mealAnalysisSystemPrompt } from "../prompts.js";
import { extractJson, todayKey, aiErrorHint } from "../util.js";
import { fileToContentBlocks, ACCEPTED_FILE_TYPES_NOTE } from "../fileContent.js";
import { suggestedWaterCups, suggestedStepGoal } from "../goals.js";
import { generateShareCode, codesMatch } from "../companionCode.js";
import { requireSession } from "../session.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

// A short in-memory lockout against code-guessing — the share code is the
// only credential on the companion-facing endpoints below (no app-lock).
const attempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function rateLimitRecord(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, fresh);
    return fresh;
  }
  return rec;
}

// ---- Primary-user management. Requires the primary login — this is
// distinct from the companion-facing routes below, which use the share
// code as their own independent credential instead. ----

router.get("/status", requireSession, async (req, res) => {
  const store = await getStore();
  const c = store.companion;
  res.json({
    enabled: c.enabled,
    code: c.enabled ? c.code : null,
    partnerLabel: c.partnerLabel,
    createdAt: c.createdAt,
    lastAccessedAt: c.lastAccessedAt,
  });
});

router.post("/enable", requireSession, async (req, res) => {
  const { partnerLabel = "" } = req.body || {};
  const code = generateShareCode();
  const store = await updateStore((s) => {
    s.companion.enabled = true;
    s.companion.code = code;
    s.companion.partnerLabel = partnerLabel.trim() || s.companion.partnerLabel || "";
    s.companion.createdAt = new Date().toISOString();
  });
  res.json({ enabled: true, code: store.companion.code, partnerLabel: store.companion.partnerLabel });
});

router.post("/regenerate", requireSession, async (req, res) => {
  const store = await getStore();
  if (!store.companion.enabled) {
    return res.status(400).json({ error: "Sharing isn't turned on yet." });
  }
  // Rotating invalidates whatever device(s) had the old code — deliberate,
  // this is the "revoke access" action as much as it is "get a fresh code".
  const code = generateShareCode();
  const updated = await updateStore((s) => {
    s.companion.code = code;
    s.companion.createdAt = new Date().toISOString();
  });
  res.json({ enabled: true, code: updated.companion.code });
});

router.post("/disable", requireSession, async (req, res) => {
  await updateStore((s) => {
    s.companion.enabled = false;
    s.companion.code = null;
  });
  res.status(204).end();
});

router.put("/label", requireSession, async (req, res) => {
  const { partnerLabel = "" } = req.body || {};
  const store = await updateStore((s) => {
    s.companion.partnerLabel = partnerLabel.trim();
  });
  res.json({ partnerLabel: store.companion.partnerLabel });
});

// ---- Companion-facing. The share code itself is the credential. ----

router.post("/verify", async (req, res) => {
  const rec = rateLimitRecord(req.ip);
  if (rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  }
  const store = await getStore();
  const c = store.companion;
  if (!c.enabled || !codesMatch(req.body?.code, c.code)) {
    rec.count += 1;
    return res.status(401).json({ error: "That code isn't valid. Double-check it with your partner." });
  }
  attempts.delete(req.ip);
  await updateStore((s) => {
    s.companion.lastAccessedAt = new Date().toISOString();
  });
  res.json({ ok: true, partnerLabel: c.partnerLabel, coachName: store.profile?.name ?? null });
});

async function requireCompanionCode(req, res, next) {
  const rec = rateLimitRecord(req.ip);
  if (rec.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  }
  const store = await getStore();
  const c = store.companion;
  const code = req.get("X-Companion-Code");
  if (!c.enabled || !codesMatch(code, c.code)) {
    rec.count += 1;
    return res.status(401).json({ error: "Invalid or expired share code." });
  }
  attempts.delete(req.ip);
  req.companionStore = store;
  next();
}

router.get("/summary", requireCompanionCode, async (req, res) => {
  const store = req.companionStore;
  const profile = store.profile;
  const today = todayKey();

  const todaysFood = store.foodLog.filter((e) => e.at?.slice(0, 10) === today);
  const caloriesConsumedToday = todaysFood.reduce((s, e) => s + (e.calories || 0), 0);
  const dailyCalorieTarget = store.weightLossProgram?.dailyCalorieTarget ?? null;

  const waterToday = store.waterLog.filter((e) => e.at?.slice(0, 10) === today).reduce((s, e) => s + e.cups, 0);
  const waterGoal = store.waterSettings.dailyGoalCups ?? suggestedWaterCups(profile);

  const stepsToday = store.stepLog.find((e) => e.date === today)?.steps ?? 0;
  const stepGoal = store.stepGoal ?? suggestedStepGoal(profile);

  const program = store.weightLossProgram;

  res.json({
    name: profile?.name ?? null,
    dailyCalorieTarget,
    caloriesConsumedToday,
    caloriesRemainingToday:
      dailyCalorieTarget != null ? Math.max(0, dailyCalorieTarget - caloriesConsumedToday) : null,
    waterToday,
    waterGoal,
    stepsToday,
    stepGoal,
    // Deliberately excludes raw weight-in-kg figures — "what to achieve" is
    // conveyed via the pace/timeline, not by publishing an exact body weight.
    program: program
      ? {
          difficulty: program.difficulty,
          totalToLoseKg: program.totalToLoseKg,
          effectiveRateKgPerWeek: program.effectiveRateKgPerWeek,
          estimatedWeeks: program.estimatedWeeks,
        }
      : null,
    todaysMeals: todaysFood
      .slice()
      .reverse()
      .map((e) => ({
        id: e.id,
        at: e.at,
        mealType: e.mealType,
        summary: e.summary,
        calories: e.calories,
        photoDataUrl: e.photoDataUrl,
        loggedBy: e.loggedBy || "user",
      })),
  });
});

router.post("/meal", requireCompanionCode, upload.single("photo"), async (req, res) => {
  const { description, mealType = "dinner" } = req.body;
  if (!description && !req.file) {
    return res
      .status(400)
      .json({ error: `Provide a description or a photo (${ACCEPTED_FILE_TYPES_NOTE}) of the meal.` });
  }
  if (!MEAL_TYPES.has(mealType)) {
    return res.status(400).json({ error: `mealType must be one of: ${[...MEAL_TYPES].join(", ")}` });
  }

  const store = req.companionStore;
  const content = [];
  if (req.file) {
    try {
      content.push(...(await fileToContentBlocks(req.file, { textLabel: "Meal data" })));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  content.push({
    type: "text",
    text: description ? `Meal description: ${description}` : "Analyze the meal shown in the attached photo.",
  });

  let analysis;
  try {
    const raw = await createMessage({
      system: mealAnalysisSystemPrompt(store.profile),
      messages: [{ role: "user", content }],
      maxTokens: 2500,
      tools: [webSearchTool(3)],
    });
    analysis = extractJson(raw);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: `Failed to analyze the meal. Please try again.${aiErrorHint(err)}` });
  }

  const photoDataUrl =
    req.file && req.file.mimetype.startsWith("image/")
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : null;

  const entry = {
    id: Date.now(),
    at: new Date().toISOString(),
    mealType,
    summary:
      description?.trim() ||
      analysis.items?.map((i) => `${i.name} (${i.portion})`).join(", ") ||
      "Shared meal",
    calories: analysis.totalCalories ?? null,
    macroBalance: analysis.macroBalance ?? null,
    photoDataUrl,
    isJunkFood: Boolean(analysis.containsJunkFood),
    junkFoodItems: analysis.junkFoodItems ?? [],
    portionAssessment: analysis.portionAssessment ?? null,
    eatingPace: null,
    fullnessLevel: null,
    loggedBy: "companion",
  };
  await updateStore((s) => {
    s.foodLog.push(entry);
  });

  res.status(201).json({ entry, analysis });
});

export default router;
