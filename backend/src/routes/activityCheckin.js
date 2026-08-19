import { Router } from "express";
import multer from "multer";
import { getStore, updateStore } from "../db.js";
import { createMessage } from "../claude.js";
import { activityCheckinSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { estimateCaloriesBurned } from "../calorieBurn.js";
import { requireSession } from "../session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const router = Router();
router.use(requireSession);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

router.post("/", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Upload a photo or screenshot of your step counter/fitness app." });
  }

  try {
    const raw = await createMessage({
      system: activityCheckinSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: req.file.mimetype, data: req.file.buffer.toString("base64") },
            },
            { type: "text", text: "Read the activity data off this screenshot/photo." },
          ],
        },
      ],
      maxTokens: 800,
    });
    const extracted = extractJson(raw);

    const store = await getStore();
    const weightKg = store.profile?.weightKg;

    // Estimate calories for any activity the screenshot didn't already show
    // a burn figure for — done before the mutator since it may call Claude.
    const activitiesWithCalories = await Promise.all(
      (extracted.activities || [])
        .filter((a) => a.type && a.durationMinutes)
        .map(async (a) => {
          if (a.caloriesBurned) return { ...a, calorieEstimateSource: "screenshot" };
          const estimate = await estimateCaloriesBurned({
            activityType: a.type,
            durationMinutes: a.durationMinutes,
            intensity: "moderate",
            weightKg,
          }).catch(() => null);
          return { ...a, caloriesBurned: estimate?.caloriesBurned ?? null, calorieEstimateSource: estimate?.source ?? null };
        })
    );

    const recorded = { stepsLogged: null, activitiesLogged: 0 };
    const day = todayKey();

    await updateStore((s) => {
      if (typeof extracted.steps === "number" && extracted.steps > 0) {
        const existing = s.stepLog.find((e) => e.date === day);
        if (existing) {
          existing.steps = extracted.steps;
          existing.source = "photo";
          existing.at = new Date().toISOString();
        } else {
          s.stepLog.push({ id: Date.now(), date: day, steps: extracted.steps, source: "photo", at: new Date().toISOString() });
        }
        recorded.stepsLogged = extracted.steps;
      }

      for (const activity of activitiesWithCalories) {
        s.activityLog.push({
          id: Date.now() + Math.random(),
          at: new Date().toISOString(),
          activityType: activity.type,
          durationMinutes: activity.durationMinutes,
          intensity: "moderate",
          note: activity.caloriesBurned ? `~${activity.caloriesBurned} kcal (from screenshot)` : "From screenshot",
          source: "photo",
          caloriesBurned: activity.caloriesBurned,
          calorieEstimateSource: activity.calorieEstimateSource,
        });
        recorded.activitiesLogged += 1;
      }
    });

    res.json({ extracted, recorded });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Couldn't read that screenshot. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
