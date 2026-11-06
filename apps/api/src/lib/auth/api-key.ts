import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "llk";

// Keys are high-entropy random tokens, not user-chosen passwords, so a fast
// hash is both sufficient and necessary on the hot ingestion path — slow
// password hashing (bcrypt/argon2) would be throughput-hostile for no
// security benefit here.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${KEY_PREFIX}_${secret}`;
  const prefix = rawKey.slice(0, KEY_PREFIX.length + 9); // llk_XXXXXXXX
  return { rawKey, prefix, hash: hashApiKey(rawKey) };
}
