// In-memory sliding-window rate limiter. State lives in a single process's
// memory, so on Vercel (each serverless/fluid instance has its own Map) the
// effective limit is per-instance, best-effort spam friction — not a hard
// guarantee across the whole deployment. No IP address is ever persisted to
// disk or a database; the key itself lives only in this Map for the
// duration of the sliding window.
const hits = new Map<string, number[]>();

const SWEEP_THRESHOLD = 1000;

export function checkRateLimit(
  key: string,
  { limit = 5, windowMs = 10 * 60_000 }: { limit?: number; windowMs?: number } = {}
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const existing = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (existing.length >= limit) {
    hits.set(key, existing);
    return false;
  }

  existing.push(now);
  hits.set(key, existing);

  if (hits.size > SWEEP_THRESHOLD) {
    for (const [k, timestamps] of hits) {
      if (timestamps.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  return true;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
