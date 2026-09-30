import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Unsubscribe links are stateless and signed, so a recipient can opt out
 * without us storing a per-send token — and so nobody can forge an opt-out
 * for an address they don't control by editing the URL.
 */

function sign(payload: string): string {
  return createHmac("sha256", env.unsubscribeSecret).update(payload).digest("base64url");
}

export function unsubscribeToken(userId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, email: email.toLowerCase() }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { userId: string; email: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    try {
      const parsed = JSON.parse(decoded) as { userId?: string; email?: string };
      return parsed.userId && parsed.email ? { userId: parsed.userId, email: parsed.email } : null;
    } catch {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)
        ? { userId: "", email: decoded.toLowerCase() }
        : null;
    }
  } catch {
    return null;
  }
}

export function unsubscribeUrl(userId: string, email: string): string {
  return `${env.baseUrl}/u/${unsubscribeToken(userId, email)}`;
}
