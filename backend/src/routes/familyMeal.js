import { Router } from "express";
import multer from "multer";
import { getStore } from "../db.js";
import { createMessage, webSearchTool } from "../claude.js";
import { familyMealSystemPrompt } from "../prompts.js";
import { extractJson, aiErrorHint } from "../util.js";
import { fileToContentBlocks, ACCEPTED_FILE_TYPES_NOTE } from "../fileContent.js";
import { requireSession } from "../session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 6 } });
const router = Router();
router.use(requireSession);

router.post("/", upload.array("photos", 6), async (req, res) => {
  const { dishesText, partySize } = req.body;
  const files = req.files || [];
  const party = Number(partySize);

  if (!dishesText?.trim() && files.length === 0) {
    return res.status(400).json({ error: `List the dishes ordered, or add a file (${ACCEPTED_FILE_TYPES_NOTE}) of the table/menu.` });
  }
  if (!Number.isFinite(party) || party < 1) {
    return res.status(400).json({ error: "partySize (number >= 1) is required" });
  }

  const store = await getStore();

  const content = [];
  for (const file of files) {
    try {
      content.push(...(await fileToContentBlocks(file, { textLabel: "Menu data" })));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  content.push({
    type: "text",
    text: dishesText?.trim()
      ? `Dishes ordered for this shared meal:\n${dishesText.trim()}`
      : "The dishes ordered are shown in the attached file(s) — a photo of the table, or a menu.",
  });

  try {
    const raw = await createMessage({
      system: familyMealSystemPrompt(store.profile, party),
      messages: [{ role: "user", content }],
      maxTokens: 3000,
      tools: [webSearchTool(4)],
    });
    const analysis = extractJson(raw);
    res.json(analysis);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to analyze the shared meal. Please try again.${aiErrorHint(err)}` });
  }
});

export default router;
