import { Router } from "express";
import multer from "multer";
import { getStore } from "../db.js";
import { createMessage, webSearchTool } from "../claude.js";
import { mealAnalysisSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { fileToContentBlocks, ACCEPTED_FILE_TYPES_NOTE } from "../fileContent.js";
import { requireSession } from "../session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const router = Router();
router.use(requireSession);

router.post("/", upload.single("photo"), async (req, res) => {
  const { description } = req.body;
  if (!description && !req.file) {
    return res.status(400).json({ error: `Provide a text description or a file (${ACCEPTED_FILE_TYPES_NOTE}) of the meal.` });
  }

  const store = await getStore();

  const content = [];
  if (req.file) {
    try {
      content.push(...(await fileToContentBlocks(req.file, { textLabel: "Meal data" })));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  content.push({
    type: "text",
    text: description
      ? `Meal description: ${description}`
      : "Analyze the meal shown/described in the attached file.",
  });

  try {
    const raw = await createMessage({
      system: mealAnalysisSystemPrompt(store.profile),
      messages: [{ role: "user", content }],
      maxTokens: 2500,
      tools: [webSearchTool(3)],
    });
    const analysis = extractJson(raw);
    res.json(analysis);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to analyze the meal. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
