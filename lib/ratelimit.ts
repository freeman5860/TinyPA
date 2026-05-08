import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let cachedRedis: Redis | null = null;

function redis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    null;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function makeLimiter(points: number, window: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string) {
  const r = redis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(points, window),
    analytics: true,
    prefix: `tinypa:rl:${prefix}`,
  });
}

export const ipAuthLimit = makeLimiter(num("TINYPA_IP_AUTH_LIMIT", 20), "1 h", "ip-auth");
export const emailAuthLimit = makeLimiter(num("TINYPA_EMAIL_AUTH_LIMIT", 5), "10 m", "email-auth");
export const userMsgBurstLimit = makeLimiter(num("TINYPA_BURST_MSG_LIMIT", 30), "1 m", "msg-burst");

export type LimitResult = { allowed: boolean; remaining: number; reset: number };

export async function safeLimit(
  limiter: Ratelimit | null,
  key: string,
  scope: string,
): Promise<LimitResult> {
  if (!limiter) return { allowed: true, remaining: -1, reset: 0 };
  try {
    const { success, remaining, reset } = await limiter.limit(key);
    return { allowed: success, remaining, reset };
  } catch (err) {
    console.warn(`[ratelimit:${scope}] fail-open`, err);
    return { allowed: true, remaining: -1, reset: 0 };
  }
}

export function rawRedis(): Redis | null {
  return redis();
}
