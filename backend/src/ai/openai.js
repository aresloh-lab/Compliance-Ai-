import OpenAI from "openai";

const rawApiKey = process.env.OPENAI_API_KEY?.trim();
const apiKey = rawApiKey || null;
const client = apiKey ? new OpenAI({ apiKey }) : null;

// Overridable since OpenAI's model lineup moves fast — gpt-4o is a safe,
// verified-capable (vision + tool-calling) default, not necessarily their
// newest, but one this code can rely on actually existing.
export const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function offlineReply() {
  return "I'm currently running in offline coach mode because OPENAI_API_KEY is not configured. Add it to the backend environment and this AI assistant will answer again.";
}

// ---- Canonical (Claude-shaped) -> OpenAI translation ----

function translateContentBlock(block) {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "image") {
    return {
      type: "image_url",
      image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
    };
  }
  if (block.type === "document") {
    return {
      type: "file",
      file: { file_data: `data:${block.source.media_type};base64,${block.source.data}`, filename: "document.pdf" },
    };
  }
  return null;
}

function translateMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: "system", content: system });

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    const blocks = msg.content || [];

    // A user turn that's entirely tool results becomes one OpenAI "tool"
    // message per result — OpenAI doesn't accept them bundled together the
    // way Claude does.
    if (blocks.length && blocks.every((b) => b.type === "tool_result")) {
      for (const b of blocks) {
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: String(b.content ?? "") });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const textParts = blocks.filter((b) => b.type === "text").map((b) => b.text);
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: textParts.length ? textParts.join("\n") : null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // User turn with mixed content (text/image/document)
    const parts = blocks.map(translateContentBlock).filter(Boolean);
    out.push({ role: "user", content: parts });
  }

  return out;
}

// Splits the canonical tools array into OpenAI function tools plus a flag
// for the one server-side sentinel (see ai/index.js's webSearchTool).
function translateTools(tools) {
  if (!tools) return { functionTools: undefined, webSearch: false };
  const webSearch = tools.some((t) => t.type === "server_web_search");
  const functionTools = tools
    .filter((t) => t.type !== "server_web_search")
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  return { functionTools: functionTools.length ? functionTools : undefined, webSearch };
}

function translateResponse(message, finishReason) {
  const content = [];
  if (message.content) content.push({ type: "text", text: message.content });
  for (const tc of message.tool_calls ?? []) {
    let input = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}");
    } catch {
      // malformed tool-call arguments — treat as no arguments rather than throw
    }
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return {
    content,
    stop_reason: finishReason === "tool_calls" ? "tool_use" : "end_turn",
  };
}

export async function createMessageRaw({ system, messages, maxTokens = 2048, tools }) {
  if (!client) {
    return { content: [{ type: "text", text: offlineReply() }], stop_reason: "end_turn" };
  }

  const { functionTools, webSearch } = translateTools(tools);
  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: maxTokens,
    messages: translateMessages(system, messages),
    ...(functionTools ? { tools: functionTools } : {}),
    ...(webSearch ? { web_search_options: { search_context_size: "medium" } } : {}),
  });

  const choice = response.choices[0];
  return translateResponse(choice.message, choice.finish_reason);
}

export async function createMessage(args) {
  const raw = await createMessageRaw(args);
  return raw.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
