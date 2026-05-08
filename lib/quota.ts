import { rawRedis } from "@/lib/ratelimit";
import { todayIsoDate } from "@/lib/time";

const DEFAULT_DAILY_LIMIT = 200;
const TTL_SECONDS = 25 * 60 * 60;

function dailyLimit(): number {
  const raw = process.env.TINYPA_DAILY_MSG_LIMIT;
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

export type QuotaResult = { ok: boolean; used: number; limit: number };

/**
 * Increments the user's daily message counter and returns whether the send
 * is within quota. Key is scoped by the user's local calendar day so a
 * fresh slot opens at midnight in the user's timezone.
 *
 * Fail-open: if Upstash is unreachable, allow the request.
 */
export async function checkAndIncrMessageQuota(
  userId: string,
  timezone: string,
): Promise<QuotaResult> {
  const limit = dailyLimit();
  const r = rawRedis();
  if (!r) return { ok: true, used: -1, limit };

  const day = todayIsoDate(timezone);
  const key = `tinypa:quota:msg:${userId}:${day}`;

  try {
    const used = await r.incr(key);
    if (used === 1) {
      await r.expire(key, TTL_SECONDS);
    }
    return { ok: used <= limit, used, limit };
  } catch (err) {
    console.warn("[quota:msg] fail-open", err);
    return { ok: true, used: -1, limit };
  }
}
