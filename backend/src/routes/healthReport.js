import { Router } from "express";
import multer from "multer";
import { createMessage, webSearchTool } from "../claude.js";
import { healthReportSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { fileToContentBlocks, ACCEPTED_FILE_TYPES_NOTE } from "../fileContent.js";
import { requireSession } from "../session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const router = Router();
router.use(requireSession);

router.post("/", upload.single("report"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: `Upload a health report file (${ACCEPTED_FILE_TYPES_NOTE}).` });
  }

  let reportBlocks;
  try {
    reportBlocks = await fileToContentBlocks(req.file, { textLabel: "Lab report data" });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  try {
    const raw = await createMessage({
      system: healthReportSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [...reportBlocks, { type: "text", text: "Analyze this health/lab report." }],
        },
      ],
      maxTokens: 2500,
      tools: [webSearchTool(2)],
    });
    const analysis = extractJson(raw);
    res.json(analysis);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to analyze the report. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
