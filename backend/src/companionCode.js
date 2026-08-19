import { randomInt, timingSafeEqual } from "crypto";

// Excludes 0/O/1/I/L — characters that are easy to mis-copy when a partner
// types the code in by hand instead of following a link.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateShareCode() {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function normalizeCode(input) {
  return (input || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codesMatch(inputCode, storedCode) {
  const a = normalizeCode(inputCode);
  const b = normalizeCode(storedCode);
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
