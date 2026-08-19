// Kept as the entry point every route file already imports from — it now
// dispatches to whichever AI provider is active (Claude/ChatGPT/Gemini, see
// ai/provider.js) instead of always being Claude. The name stayed "claude.js"
// so this didn't need to touch the ~15 files that import from it; the actual
// per-provider logic lives in ./ai/.
export { createMessage, createMessageRaw, webSearchTool } from "./ai/index.js";
