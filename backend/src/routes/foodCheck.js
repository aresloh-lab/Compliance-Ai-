import { Router } from "express";
import multer from "multer";
import { getStore, updateStore } from "../db.js";
import { createMessage, webSearchTool } from "../claude.js";
import { foodCheckSystemPrompt } from "../prompts.js";
import { buildRecentContext } from "../recentContext.js";
import { aiErrorHint } from "../util.js";
import { requireSession } from "../session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const router = Router();
router.use(requireSession);

// "Should I eat this?" — a quick, decision-oriented check distinct from the
// full meal analyzer. Plain-text advice (not JSON), and it's folded into the
// same chat history so it shows up in the Coach tab too.
router.post("/", upload.single("photo"), async (req, res) => {
  const { description } = req.body;
  if (!description?.trim() && !req.file) {
    return res.status(400).json({ error: "Describe or photograph what you're considering eating." });
  }

  const store = await getStore();

  const content = [];
  if (req.file) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: req.file.mimetype, data: req.file.buffer.toString("base64") },
    });
  }
  content.push({
    type: "text",
    text: description?.trim()
      ? `Should I eat this? ${description.trim()}`
      : "Should I eat this? (see attached photo)",
  });

  const userLabel = description?.trim()
    ? `Should I eat this? ${description.trim()}`
    : "Should I eat this? (photo attached)";

  try {
    const reply = await createMessage({
      system: foodCheckSystemPrompt(store.profile, buildRecentContext(store)),
      messages: [{ role: "user", content }],
      maxTokens: 800,
      tools: [webSearchTool(2)],
    });

    await updateStore((s) => {
      s.chatHistory.push({ role: "user", content: userLabel, at: Date.now() });
      s.chatHistory.push({ role: "assistant", content: reply, at: Date.now() });
    });

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Couldn't get advice right now. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
