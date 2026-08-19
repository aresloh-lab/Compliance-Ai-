import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { suggestedWaterCups } from "../goals.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

// Spread reminders evenly across the active window so hitting the goal is
// actually achievable, rather than a fixed interval that doesn't scale with
// a higher or lower personalized goal.
function suggestedIntervalMinutes(goalCups, startHour, endHour) {
  const windowMinutes = Math.max(60, (endHour - startHour) * 60);
  const interval = Math.round(windowMinutes / Math.max(goalCups, 1));
  return Math.max(30, Math.min(180, interval));
}

async function settingsResponse(store) {
  const s = store.waterSettings;
  const suggested = suggestedWaterCups(store.profile);
  const effectiveGoal = s.dailyGoalCups ?? suggested;
  return {
    dailyGoalCups: s.dailyGoalCups, // explicit override, or null = using the auto-suggested goal
    suggested,
    intervalMinutes: s.intervalMinutes,
    suggestedIntervalMinutes: suggestedIntervalMinutes(effectiveGoal, s.startHour, s.endHour),
    startHour: s.startHour,
    endHour: s.endHour,
  };
}

router.get("/settings", async (req, res) => {
  const store = await getStore();
  res.json(await settingsResponse(store));
});

router.put("/settings", async (req, res) => {
  const { dailyGoalCups, intervalMinutes, startHour, endHour } = req.body;
  const store = await updateStore((s) => {
    if (dailyGoalCups !== undefined) {
      s.waterSettings.dailyGoalCups = dailyGoalCups === null || dailyGoalCups === "" ? null : Number(dailyGoalCups);
    }
    if (intervalMinutes !== undefined) {
      s.waterSettings.intervalMinutes = intervalMinutes === null || intervalMinutes === "" ? null : Number(intervalMinutes);
    }
    if (startHour !== undefined) s.waterSettings.startHour = Number(startHour);
    if (endHour !== undefined) s.waterSettings.endHour = Number(endHour);
  });
  res.json(await settingsResponse(store));
});

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.waterLog);
});

router.post("/", async (req, res) => {
  const cups = Number(req.body.cups) || 1;
  const entry = { id: Date.now(), at: new Date().toISOString(), cups };
  await updateStore((s) => {
    s.waterLog.push(entry);
  });
  res.status(201).json(entry);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await updateStore((s) => {
    s.waterLog = s.waterLog.filter((e) => e.id !== id);
  });
  res.status(204).end();
});

export default router;
