import { GoogleGenAI } from "@google/genai";

const rawApiKey = process.env.GEMINI_API_KEY?.trim();
const apiKey = rawApiKey || null;
const client = apiKey ? new GoogleGenAI({ apiKey }) : null;

// "gemini-2.0-flash" (this app's original default) was retired by Google;
// "gemini-2.5-flash" and "gemini-2.5-flash-lite" are blocked for new accounts;
// "gemini-flash-latest" hit transient 503s. "gemini-3.7-flash" worked but its
// free tier is capped at only 20 requests/day (confirmed live via a 429
// RESOURCE_EXHAUSTED — GenerateRequestsPerDayPerProjectPerModel-FreeTier,
// limit 20) — exhausted almost immediately under real use. "gemini-3.5-flash-lite"
// is confirmed working with a much less restrictive free quota. If this stops
// working, re-run `ai.models.list()` rather than guessing the next name.
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const isLiteModel = MODEL.includes("lite");

function offlineReply() {
  return "I'm currently running in offline coach mode because GEMINI_API_KEY is not configured. Add it to the backend environment and this AI assistant will answer again.";
}

// ---- Canonical (Claude-shaped) -> Gemini translation ----

function translateContentBlock(block) {
  if (block.type === "text") return { text: block.text };
  if (block.type === "image" || block.type === "document") {
    return { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
  }
  return null;
}

// Gemini's functionResponse addresses by function *name*, not by the
// tool_use_id Claude/OpenAI use — this map lets a later tool_result block
// look up which name its id corresponds to, from the tool_use block that
// preceded it earlier in the same conversation.
function translateMessages(messages) {
  const idToName = new Map();
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";

    if (typeof msg.content === "string") {
      contents.push({ role, parts: [{ text: msg.content }] });
      continue;
    }

    const blocks = msg.content || [];
    const parts = [];
    for (const b of blocks) {
      if (b.type === "tool_use") {
        idToName.set(b.id, b.name);
        const part = { functionCall: { id: b.id, name: b.name, args: b.input ?? {} } };
        // Gemini 3.x requires the thought_signature it originally attached to a
        // function call to be echoed back verbatim on later turns, or it 400s
        // with "Function call is missing a thought_signature" (confirmed live).
        // We stash it on the canonical tool_use block when we first receive it
        // (see createMessageRaw below) so it can be replayed here.
        if (b._geminiThoughtSignature) part.thoughtSignature = b._geminiThoughtSignature;
        parts.push(part);
      } else if (b.type === "tool_result") {
        const name = idToName.get(b.tool_use_id) ?? b.tool_use_id;
        parts.push({ functionResponse: { id: b.tool_use_id, name, response: { output: String(b.content ?? "") } } });
      } else {
        const part = translateContentBlock(b);
        if (part) parts.push(part);
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  return contents;
}

// Gemini's API doesn't reliably support combining custom functionDeclarations
// with the built-in googleSearch tool in one request — when both are
// present (only chat.js's 28-tool coach loop has function tools at all),
// function tools win and web search is dropped for that call. Every other
// caller only ever passes the search sentinel, so this rarely matters.
function translateTools(tools) {
  if (!tools) return undefined;
  const functionDeclarations = tools
    .filter((t) => t.type !== "server_web_search")
    .map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }));
  if (functionDeclarations.length) return [{ functionDeclarations }];
  if (tools.some((t) => t.type === "server_web_search")) return [{ googleSearch: {} }];
  return undefined;
}

async function generateContentOnce({ system, messages, maxTokens, tools, dropSearch }) {
  const translatedTools = tools ? translateTools(tools) : undefined;
  const useTools = dropSearch && translatedTools?.[0]?.googleSearch ? undefined : translatedTools;
  return client.models.generateContent({
    model: MODEL,
    contents: translateMessages(messages),
    config: {
      ...(system ? { systemInstruction: system } : {}),
      maxOutputTokens: maxTokens,
      // Newer non-lite Gemini models spend output tokens on hidden "thinking"
      // before the visible answer, which can silently consume the whole
      // maxTokens budget on a low-effort prompt (confirmed live: a 20-token
      // budget produced an empty response with finishReason MAX_TOKENS).
      // Disabled so behavior matches the fixed, predictable token budgets
      // every other provider/route in this app already assumes. Lite models
      // don't support this field at all — sending it 400s (confirmed live).
      ...(isLiteModel ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      ...(useTools ? { tools: useTools } : {}),
    },
  });
}

export async function createMessageRaw({ system, messages, maxTokens = 2048, tools }) {
  if (!client) {
    return { content: [{ type: "text", text: offlineReply() }], stop_reason: "end_turn" };
  }

  let response;
  try {
    response = await generateContentOnce({ system, messages, maxTokens, tools });
  } catch (err) {
    // Google's free-tier web-search grounding quota is far smaller than the
    // plain-generation quota and separate from it (confirmed live: the exact
    // same call succeeds instantly with the search tool removed) — callers
    // that only attach the search sentinel (plan/program generation; the
    // main coach loop never reaches here since it always has custom tools,
    // which the API prioritizes over search grounding, see translateTools)
    // would otherwise fail outright the moment search quota — not the
    // model's own quota — runs out. Retrying once without search lets them
    // degrade to no-live-lookup instead of failing the whole request.
    const status = err?.status ?? err?.response?.status;
    const isQuota = status === 429 || `${err?.message ?? ""}`.includes("RESOURCE_EXHAUSTED");
    if (!isQuota || !tools) throw err;
    response = await generateContentOnce({ system, messages, maxTokens, tools, dropSearch: true });
  }

  const content = [];
  const text = response.text;
  if (text) content.push({ type: "text", text });

  // response.functionCalls flattens away the thoughtSignature that lives
  // beside (not inside) each functionCall part — read the raw parts instead
  // so it can be captured and replayed on the next turn (see translateMessages).
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const functionCallParts = parts.filter((p) => p.functionCall);
  functionCallParts.forEach((p, i) => {
    const fc = p.functionCall;
    content.push({
      type: "tool_use",
      id: fc.id || `${fc.name}_${i}`,
      name: fc.name,
      input: fc.args ?? {},
      ...(p.thoughtSignature ? { _geminiThoughtSignature: p.thoughtSignature } : {}),
    });
  });

  return {
    content,
    stop_reason: functionCallParts.length ? "tool_use" : "end_turn",
  };
}

export async function createMessage(args) {
  const raw = await createMessageRaw(args);
  return raw.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
