import { Router } from "express";
import { getStore, updateStore } from "../db.js";
import { createMessageRaw, webSearchTool } from "../claude.js";
import { coachSystemPrompt } from "../prompts.js";
import { buildRecentContext } from "../recentContext.js";
import { TOOL_DEFINITIONS, executeTool } from "../chatTools.js";
import { aiErrorHint } from "../util.js";
import { requireSession } from "../session.js";

const router = Router();
router.use(requireSession);
const MAX_TOOL_ITERATIONS = 5;

router.get("/", async (req, res) => {
  const store = await getStore();
  res.json(store.chatHistory);
});

router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  const store = await getStore();
  const history = store.chatHistory.slice(-20).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [...history, { role: "user", content: message }];
  const system = coachSystemPrompt(store.profile, buildRecentContext(store));
  const tools = [webSearchTool(2), ...TOOL_DEFINITIONS];
  const actions = [];
  let reply = "";

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await createMessageRaw({ system, messages, maxTokens: 1536, tools });
      const textBlocks = response.content.filter((b) => b.type === "text").map((b) => b.text);

      if (response.stop_reason !== "tool_use") {
        reply = textBlocks.join("\n");
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await executeTool(block.name, block.input);
        if (result.isClientAction && result.action) actions.push(result.action);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.resultText });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!reply) reply = "Done!";

    await updateStore((s) => {
      s.chatHistory.push({ role: "user", content: message, at: Date.now() });
      s.chatHistory.push({ role: "assistant", content: reply, at: Date.now() });
    });

    res.json({ reply, actions });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: `Failed to reach the coach. Please try again.${aiErrorHint(err)}` });
  }
});

router.delete("/", async (req, res) => {
  await updateStore((s) => {
    s.chatHistory = [];
  });
  res.status(204).end();
});

export default router;
