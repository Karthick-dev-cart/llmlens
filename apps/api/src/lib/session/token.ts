// Dev-only stand-in for what a real identity provider (Clerk) would issue
// and verify via asymmetric keys. apps/api acts as the "issuer" here so
// apps/web never has to touch the DB directly to bootstrap a session — the
// same shape a Clerk swap would eventually have (web gets a token, forwards
// it as Bearer, api verifies). Uses Web Crypto (not node:crypto) so the
// verify half of this is portable to apps/web's middleware, which may run
// on the Edge runtime.
const encoder = new TextEncoder();

export interface SessionPayload {
  userId: string;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(sigB64),
    encoder.encode(payloadB64),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
