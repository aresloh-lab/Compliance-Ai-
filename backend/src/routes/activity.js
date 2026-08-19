import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { estimateCaloriesBurned } from "../calorieBurn.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);
const INTENSITIES = new Set(["light", "moderate", "vigorous"]);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.activityLog);
});

router.post("/", async (req, res) => {
  const { activityType, durationMinutes, intensity = "moderate", note = "" } = req.body;
  if (!activityType || typeof activityType !== "string") {
    return res.status(400).json({ error: "activityType is required (e.g. basketball, swimming, gym)" });
  }
  if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
    return res.status(400).json({ error: "durationMinutes (number > 0) is required" });
  }
  if (!INTENSITIES.has(intensity)) {
    return res.status(400).json({ error: `intensity must be one of: ${[...INTENSITIES].join(", ")}` });
  }

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
    note,
    source: "manual",
    caloriesBurned: estimate?.caloriesBurned ?? null,
    calorieEstimateSource: estimate?.source ?? null,
  };
  await updateStore((s) => {
    s.activityLog.push(entry);
  });
  res.status(201).json(entry);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await updateStore((s) => {
    s.activityLog = s.activityLog.filter((e) => e.id !== id);
  });
  res.status(204).end();
});

export default router;
