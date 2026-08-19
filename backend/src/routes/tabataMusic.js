import { Router } from "express";
import { createMessage, webSearchTool } from "../claude.js";
import { tabataMusicSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

// No in-app playback (that would need real streaming/licensing integration,
// e.g. a Spotify account + their Web Playback SDK — a much bigger lift than
// what was asked for). Instead: real, accurately-named track suggestions the
// user opens in whatever music app they already have, alongside the actual
// Tabata interval timer doing the work/rest pacing.
router.post("/", async (req, res) => {
  try {
    const raw = await createMessage({
      system: tabataMusicSystemPrompt(),
      messages: [{ role: "user", content: "Suggest Tabata-paced workout tracks." }],
      maxTokens: 1200,
      tools: [webSearchTool(3)],
    });
    const { tracks } = extractJson(raw);
    res.json({ tracks: Array.isArray(tracks) ? tracks : [], generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to get music suggestions. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
