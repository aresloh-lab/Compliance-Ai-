import { Router } from "express";
import { getProviderStatus, setActiveProvider, isConfigured, PROVIDERS } from "../ai/index.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);

router.get("/status", async (req, res) => {
  res.json(await getProviderStatus());
});

router.put("/provider", async (req, res) => {
  const { provider } = req.body;
  if (!PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Unknown provider "${provider}". Must be one of: ${PROVIDERS.join(", ")}` });
  }
  if (!isConfigured(provider)) {
    return res.status(400).json({
      error: `That provider's API key isn't set in backend/.env yet — add it first, then switch to it.`,
    });
  }
  try {
    await setActiveProvider(provider);
    res.json(await getProviderStatus());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
