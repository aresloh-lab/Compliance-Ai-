import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getFrontendUrl } from "./util.js";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return { hash: derivedKey.toString("hex"), salt };
}

export async function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(hash, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuffer, derivedKey);
}

// XXXX-XXXX-XXXX from an alphabet with ambiguous characters (0/O, 1/I/L)
// removed, since this gets hand-copied/retyped from a screen.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += RECOVERY_ALPHABET[randomBytes(1)[0] % RECOVERY_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

// Same origin the frontend is served from — WebAuthn requires the RP ID to
// be that origin's bare hostname, and the origin to match exactly.
export function webauthnRPConfig() {
  const origin = getFrontendUrl();
  const rpID = new URL(origin).hostname;
  return { rpID, origin, rpName: "Healthy Weight Coach" };
}
