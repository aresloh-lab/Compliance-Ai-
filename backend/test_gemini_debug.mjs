import "dotenv/config";
import { createMessageRaw } from "./src/ai/gemini.js";
import { webSearchTool } from "./src/ai/index.js";
import { TOOL_DEFINITIONS } from "./src/chatTools.js";
import { coachSystemPrompt } from "./src/prompts.js";
import { buildRecentContext } from "./src/recentContext.js";
import { getStore } from "./src/db.js";

const store = await getStore();
const tools = [webSearchTool(2), ...TOOL_DEFINITIONS];
const system = coachSystemPrompt(store.profile, buildRecentContext(store));
console.log("SYSTEM PROMPT LENGTH:", system.length);
try {
  const resp = await createMessageRaw({
    system,
    messages: [{ role: "user", content: "hello, how are you?" }],
    maxTokens: 1536,
    tools,
  });
  console.log(JSON.stringify(resp, null, 2));
} catch (err) {
  console.error("ERROR MESSAGE:", err.message);
  console.error(err);
}
