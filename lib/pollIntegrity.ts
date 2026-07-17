import { createHash } from "node:crypto";

// Deliberate departure from lib/rateLimit.ts's "no IP is ever persisted" posture: the
// alumni-ratings integrity checks (one-per-program-per-visitor signal, moderation's
// "flag repeated ipHash") need something durable across requests, which the in-memory
// limiter can't provide. Only a salted SHA-256 is ever stored -- never the raw IP -- and
// it's never selected into any public page or client-component prop, same rule as
// PollResponse.email.
const DEV_FALLBACK_SALT = "dev-salt-do-not-use-in-production";

export function hashIp(ip: string): string {
  const salt = process.env.POLL_IP_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("POLL_IP_SALT must be set in production for the alumni-ratings integrity hash");
    }
    return createHash("sha256").update(`${DEV_FALLBACK_SALT}:${ip}`).digest("hex");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
