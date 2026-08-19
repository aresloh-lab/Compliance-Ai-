import { Router } from "express";
import { getStore } from "../db.js";
import { buildRepSet } from "../repCounter.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.post("/", async (req, res) => {
  const { exerciseType } = req.body;
  if (!exerciseType || typeof exerciseType !== "string" || !exerciseType.trim()) {
    return res.status(400).json({ error: "exerciseType is required (e.g. push-ups, squats)." });
  }
  const store = await getStore();
  const set = await buildRepSet({ exerciseType: exerciseType.trim(), profile: store.profile });
  res.json(set);
});

export default router;
