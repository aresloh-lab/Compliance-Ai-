import Anthropic from "@anthropic-ai/sdk";

const rawApiKey = process.env.ANTHROPIC_API_KEY?.trim();
const apiKey = rawApiKey && rawApiKey.toLowerCase() !== "your-api-key-here" ? rawApiKey : null;
const client = apiKey ? new Anthropic({ apiKey }) : null;

// Continue to default to a Claude model when no override is provided, while
// allowing the runtime to switch to a different Anthropic model through the
// environment instead of hard-wiring an unsupported alias.
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

function extractLastUserText(messages) {
  const last = [...(messages || [])].reverse().find((m) => m?.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join(" ");
  }
  return "";
}

function buildOfflineCoachReply(messages = []) {
  const userPrompt = extractLastUserText(messages);
  return `I’m currently running in offline coach mode because the Anthropic API key is not configured. Your request was: “${userPrompt || "how can I help you today?"}” — add ANTHROPIC_API_KEY to the backend environment and the live AI assistant will answer again.`;
}

// Claude's tool/content-block shape is this app's canonical shape (see
// ai/index.js) since it was already used everywhere before other providers
// existed — so the only translation this adapter needs is the one sentinel
// (canonical "server_web_search" -> Claude's actual web-search tool type).
// Plain function tools ({name, description, input_schema}) pass through as-is.
function translateTools(tools) {
  if (!tools) return undefined;
  return tools.map((t) =>
    t.type === "server_web_search"
      ? { type: "web_search_20260209", name: "web_search", max_uses: t.max_uses ?? 3 }
      : t
  );
}

export async function createMessage({ system, messages, maxTokens = 2048, tools }) {
  if (!client) {
    return buildOfflineCoachReply(messages);
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(tools ? { tools: translateTools(tools) } : {}),
  });
  // With tool use, the response can interleave server_tool_use / tool_result
  // blocks with more than one text block — join them all rather than
  // grabbing only the first, or trailing output after a search gets dropped.
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// Returns the canonical raw shape ({content: [...blocks], stop_reason}) —
// needed wherever the caller must inspect tool_use blocks / stop_reason
// itself (the chat.js manual tool loop), unlike createMessage's text-only
// callers. Since Claude's response already *is* that canonical shape, this
// adapter returns it directly with no translation.
export async function createMessageRaw({ system, messages, maxTokens = 2048, tools }) {
  if (!client) {
    const reply = buildOfflineCoachReply(messages);
    return {
      content: [{ type: "text", text: reply }],
      stop_reason: "end_turn",
      model: MODEL,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  return client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(tools ? { tools: translateTools(tools) } : {}),
  });
}

export { client };
