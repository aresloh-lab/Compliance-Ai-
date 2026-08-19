import * as anthropic from "./anthropic.js";
import * as openai from "./openai.js";
import * as gemini from "./gemini.js";
import { getActiveProviderName } from "./provider.js";

export { getProviderStatus, setActiveProvider, isConfigured, PROVIDERS } from "./provider.js";

const ADAPTERS = { anthropic, openai, gemini };

async function getAdapter() {
  const name = await getActiveProviderName();
  return ADAPTERS[name];
}

// Canonical sentinel for "let the model search the web itself, server-side,
// within this same call" — each adapter translates this into whatever its
// own provider calls that (Claude: web_search_20260209 tool; OpenAI:
// web_search_options; Gemini: the googleSearch tool). Every provider
// resolves it in one round trip, same as the rest of this app already
// assumes, so no caller needs to know which provider is actually active.
export function webSearchTool(maxUses = 3) {
  return { type: "server_web_search", max_uses: maxUses };
}

export async function createMessage(args) {
  const adapter = await getAdapter();
  return adapter.createMessage(args);
}

export async function createMessageRaw(args) {
  const adapter = await getAdapter();
  return adapter.createMessageRaw(args);
}
