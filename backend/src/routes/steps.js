import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { suggestedStepGoal } from "../goals.js";
import { todayKey } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/goal", async (req, res) => {
  const store = await getStore();
  res.json({
    goal: store.stepGoal,
    suggested: suggestedStepGoal(store.profile),
  });
});

router.put("/goal", async (req, res) => {
  const goal = Number(req.body.goal);
  if (!Number.isFinite(goal) || goal <= 0) {
    return res.status(400).json({ error: "goal (number > 0) is required" });
  }
  const store = await updateStore((s) => {
    s.stepGoal = goal;
  });
  res.json({ goal: store.stepGoal });
});

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.stepLog);
});

// Logging is a per-day upsert — re-logging today just updates today's count,
// since a step count is a running daily total, not a discrete event.
router.post("/", async (req, res) => {
  const steps = Number(req.body.steps);
  if (!Number.isFinite(steps) || steps < 0) {
    return res.status(400).json({ error: "steps (number >= 0) is required" });
  }
  const day = todayKey();
  const store = await updateStore((s) => {
    const existing = s.stepLog.find((e) => e.date === day);
    if (existing) {
      existing.steps = steps;
      existing.source = "manual";
      existing.at = new Date().toISOString();
    } else {
      s.stepLog.push({ id: Date.now(), date: day, steps, source: "manual", at: new Date().toISOString() });
    }
  });
  res.status(201).json(store.stepLog.find((e) => e.date === day));
});

export default router;
