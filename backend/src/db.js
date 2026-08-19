import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so a production deploy can point this at a mounted persistent
// disk (e.g. Render) instead of the app's own ephemeral filesystem — without
// it, every redeploy/restart would wipe all logged data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_DATA = {
  profile: null,
  chatHistory: [],
  progressEntries: [],
  foodLog: [],
  junkFoodPlan: null,
  activityLog: [],
  stepGoal: null,
  stepLog: [],
  supplementLog: [],
  rewardRedemptions: [],
  alternativePlan: null,
  weightLossProgram: null,
  dailyPlan: null, // "Today's plan" — regenerated on demand but kept around so leaving the tab doesn't lose it
  security: {
    username: null, // login username, set together with passwordHash at registration
    passwordHash: null,
    passwordSalt: null,
    recoveryCodeHash: null, // lets a forgotten password be reset without wiping the account; rotated every time it's used
    recoveryCodeSalt: null,
    webauthnCredential: null, // { id, publicKey (base64url), counter, transports }
    webauthnUserID: null, // base64url, stable handle for the one local user
    currentChallenge: null, // pending WebAuthn ceremony challenge
  },
  googleFit: {
    connected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    lastSyncedAt: null,
    importedSessionIds: [],
  },
  googleDrive: {
    connected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    fileId: null,
    lastBackupAt: null,
  },
  waterLog: [],
  waterSettings: {
    dailyGoalCups: null, // null = use the auto-suggested goal computed from profile
    startHour: 8,
    endHour: 22,
    intervalMinutes: null, // null = use the auto-suggested interval
  },
  companion: {
    enabled: false,
    code: null, // e.g. "AB3D-9FGH" — shared out-of-band with a partner; this code IS their credential
    partnerLabel: "", // optional name, e.g. "Sarah", shown back to the primary user
    createdAt: null,
    lastAccessedAt: null,
  },
  aiProvider: "anthropic", // "anthropic" | "openai" | "gemini" — which AI model powers every feature
};

let cache = null;
let writeQueue = Promise.resolve();

async function ensureStore() {
  if (cache) return cache;
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    await writeFile(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
  cache = JSON.parse(await readFile(DATA_FILE, "utf-8"));

  // Backfill any top-level keys added to the schema since this file was last
  // written, so an older store.json doesn't crash routes that assume they exist.
  let migrated = false;
  for (const key of Object.keys(DEFAULT_DATA)) {
    if (!(key in cache)) {
      cache[key] = DEFAULT_DATA[key];
      migrated = true;
    }
  }
  if (migrated) await writeFile(DATA_FILE, JSON.stringify(cache, null, 2));

  return cache;
}

function persist() {
  writeQueue = writeQueue.then(() =>
    writeFile(DATA_FILE, JSON.stringify(cache, null, 2))
  );
  return writeQueue;
}

export async function getStore() {
  return ensureStore();
}

export async function updateStore(mutator) {
  const store = await ensureStore();
  mutator(store);
  await persist();
  return store;
}
