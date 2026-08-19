import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { createMessage } from "../claude.js";
import { junkFoodPlanSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.junkFoodPlan);
});

router.post("/", async (req, res) => {
  const store = await getStore();
  if (!store.profile) {
    return res.status(400).json({ error: "Set up your profile first." });
  }
  const baselinePerWeek = Number(req.body.baselinePerWeek);
  if (!Number.isFinite(baselinePerWeek) || baselinePerWeek < 0) {
    return res.status(400).json({ error: "baselinePerWeek (number >= 0) is required" });
  }

  try {
    const raw = await createMessage({
      system: junkFoodPlanSystemPrompt(store.profile, baselinePerWeek),
      messages: [{ role: "user", content: "Generate my gradual reduction plan." }],
      maxTokens: 1800,
    });
    const plan = extractJson(raw);
    const saved = await updateStore((s) => {
      s.junkFoodPlan = { ...plan, generatedAt: new Date().toISOString() };
    });
    res.json(saved.junkFoodPlan);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to generate a plan. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
