import { getStore, updateStore } from "../db.js";

// The user's chosen active provider, persisted so it survives restarts —
// but the actual API key always comes from the environment (.env), never
// from the store, same as ANTHROPIC_API_KEY always has.
export const PROVIDERS = ["anthropic", "openai", "gemini"];
const DEFAULT_PROVIDER = "anthropic";

const ENV_KEY = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const LABEL = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google AI)",
};

export function isConfigured(provider) {
  return Boolean(process.env[ENV_KEY[provider]]);
}

export async function getActiveProviderName() {
  const store = await getStore();
  const saved = store.aiProvider;
  if (PROVIDERS.includes(saved) && isConfigured(saved)) return saved;
  // Fall back to whichever provider actually has a key set, so switching
  // .env values (or a fresh install with only one key) doesn't silently 500.
  return PROVIDERS.find(isConfigured) ?? DEFAULT_PROVIDER;
}

export async function setActiveProvider(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unknown provider "${provider}". Must be one of: ${PROVIDERS.join(", ")}`);
  }
  await updateStore((s) => {
    s.aiProvider = provider;
  });
}

export async function getProviderStatus() {
  const active = await getActiveProviderName();
  return {
    active,
    providers: PROVIDERS.map((id) => ({
      id,
      label: LABEL[id],
      configured: isConfigured(id),
    })),
  };
}
