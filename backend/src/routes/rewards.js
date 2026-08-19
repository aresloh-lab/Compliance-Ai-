import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { computeRewardsSummary } from "../rewards.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(computeRewardsSummary(store));
});

router.post("/redeem", async (req, res) => {
  const store = await getStore();
  const summary = computeRewardsSummary(store);
  if (summary.availableCredits <= 0) {
    return res.status(400).json({
      error: `No treat credits available yet — log extra activity to earn one (${summary.rules.creditMinutes} min = 1 credit).`,
    });
  }
  const updated = await updateStore((s) => {
    s.rewardRedemptions.push({ id: Date.now(), at: new Date().toISOString() });
  });
  res.status(201).json(computeRewardsSummary(updated));
});

export default router;
