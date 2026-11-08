import { lookup } from "node:dns/promises";

// Budget channel webhook URLs are supplied by an authenticated user of
// *their own* project, but the server is the one making the outbound
// request — an unguarded fetch(userSuppliedUrl) is a textbook SSRF vector
// (OWASP A10): point it at http://169.254.169.254/... (cloud metadata) or
// an internal service and the API will dutifully forward attacker-shaped
// JSON there. This resolves the hostname and rejects anything that isn't a
// public, routable address, in addition to requiring https.
//
// Not airtight DNS-rebinding protection (fetch() re-resolves after this
// check passes), but it closes the straightforward case and is the
// standard baseline mitigation for a user-supplied outbound webhook.

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a = 0, b = 0] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // fe80::/10 link-local
  if (normalized.startsWith("feb") || normalized.startsWith("fea")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

export async function isSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  try {
    const { address, family } = await lookup(url.hostname);
    return family === 4 ? !isPrivateIPv4(address) : !isPrivateIPv6(address);
  } catch {
    return false; // DNS failure — fail closed
  }
}
