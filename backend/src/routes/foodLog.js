import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const EATING_PACES = new Set(["quick", "normal", "slow"]);
const FULLNESS_LEVELS = new Set(["stopped_satisfied", "ate_until_full", "ate_past_full"]);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.foodLog);
});

router.post("/", async (req, res) => {
  const {
    mealType,
    summary,
    calories = null,
    macroBalance = null,
    photoDataUrl = null,
    isJunkFood = false,
    junkFoodItems = [],
    portionAssessment = null,
    eatingPace = null,
    fullnessLevel = null,
    loggedBy = "user",
  } = req.body;
  if (!MEAL_TYPES.has(mealType)) {
    return res.status(400).json({ error: `mealType must be one of: ${[...MEAL_TYPES].join(", ")}` });
  }
  if (!summary || typeof summary !== "string") {
    return res.status(400).json({ error: "summary is required" });
  }
  if (photoDataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(photoDataUrl)) {
    return res.status(400).json({ error: "photoDataUrl must be a base64 image data URL" });
  }
  if (eatingPace && !EATING_PACES.has(eatingPace)) {
    return res.status(400).json({ error: `eatingPace must be one of: ${[...EATING_PACES].join(", ")}` });
  }
  if (fullnessLevel && !FULLNESS_LEVELS.has(fullnessLevel)) {
    return res.status(400).json({ error: `fullnessLevel must be one of: ${[...FULLNESS_LEVELS].join(", ")}` });
  }

  const entry = {
    id: Date.now(),
    at: new Date().toISOString(),
    mealType,
    summary,
    calories,
    macroBalance,
    photoDataUrl,
    isJunkFood: Boolean(isJunkFood),
    junkFoodItems,
    portionAssessment,
    eatingPace,
    fullnessLevel,
    loggedBy: loggedBy === "companion" ? "companion" : "user",
  };
  await updateStore((s) => {
    s.foodLog.push(entry);
  });
  res.status(201).json(entry);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await updateStore((s) => {
    s.foodLog = s.foodLog.filter((e) => e.id !== id);
  });
  res.status(204).end();
});

export default router;
