import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { createMessage } from "../claude.js";
import { alternativePlanSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { computePlateauStatus, buildAlternativePlanContext } from "../plateau.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/", async (req, res) => {
  const store = await getStore();
  const weightEntries = store.progressEntries.filter((e) => e.type === "weight");
  res.json(computePlateauStatus(store.profile, weightEntries));
});

router.get("/plan", async (req, res) => {
  const store = await getStore();
  res.json(store.alternativePlan);
});

router.post("/plan", async (req, res) => {
  const store = await getStore();
  if (!store.profile) {
    return res.status(400).json({ error: "Set up your profile first." });
  }
  const weightEntries = store.progressEntries.filter((e) => e.type === "weight");
  const plateauStatus = computePlateauStatus(store.profile, weightEntries);
  if (plateauStatus.status === "insufficient_data") {
    return res.status(400).json({
      error: `Not enough weight history yet — log at least ${3} readings spanning a week or more to get a read on your trend.`,
    });
  }

  const dataContext = buildAlternativePlanContext(store, plateauStatus);

  try {
    const raw = await createMessage({
      system: alternativePlanSystemPrompt(store.profile, dataContext),
      messages: [{ role: "user", content: "Give me an alternative approach based on my recent data." }],
      maxTokens: 2000,
    });
    const plan = extractJson(raw);
    const saved = await updateStore((s) => {
      s.alternativePlan = { ...plan, generatedAt: new Date().toISOString(), basedOn: plateauStatus };
    });
    res.json(saved.alternativePlan);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to generate an alternative plan. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
