import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { createMessage, webSearchTool } from "../claude.js";
import { planSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.dailyPlan);
});

router.post("/", async (req, res) => {
  const store = await getStore();
  if (!store.profile) {
    return res.status(400).json({ error: "Set up your profile first." });
  }

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
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to generate a plan. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
