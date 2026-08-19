import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { createMessage } from "../claude.js";
import { weightLossProgramSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { buildProgramPlan } from "../weightLossProgram.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);
const DIFFICULTIES = new Set(["easy", "normal", "hard"]);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.weightLossProgram);
});

router.post("/", async (req, res) => {
  const store = await getStore();
  if (!store.profile) {
    return res.status(400).json({ error: "Set up your profile first." });
  }
  if (!store.profile.goalWeightKg) {
    return res.status(400).json({ error: "Set a goal weight in your profile first." });
  }

  const { difficulty, targetDays } = req.body;
  const hasDifficulty = difficulty && DIFFICULTIES.has(difficulty);
  const hasDays = Number.isFinite(Number(targetDays)) && Number(targetDays) > 0;
  if (!hasDifficulty && !hasDays) {
    return res.status(400).json({ error: "Provide either a difficulty (easy/normal/hard) or a target number of days." });
  }

  const computed = buildProgramPlan(store.profile, {
    difficulty: hasDifficulty ? difficulty : null,
    targetDays: hasDifficulty ? null : Number(targetDays),
  });

  if (computed.status === "already_at_goal") {
    return res.status(400).json({
      error: "Your goal weight isn't below your current weight, so there's no loss program to build — update your goal weight if that's not right.",
    });
  }

  try {
    const raw = await createMessage({
      system: weightLossProgramSystemPrompt(store.profile, computed),
      messages: [{ role: "user", content: "Generate my program." }],
      maxTokens: 3000,
    });
    const aiContent = extractJson(raw);
    const program = { ...computed, ...aiContent, generatedAt: new Date().toISOString() };
    const saved = await updateStore((s) => {
      s.weightLossProgram = program;
    });
    res.json(saved.weightLossProgram);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to generate your program. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
