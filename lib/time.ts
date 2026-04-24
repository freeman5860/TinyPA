import { toZonedTime, fromZonedTime, format as formatTz } from "date-fns-tz";
import { startOfDay, endOfDay, addDays, formatISO } from "date-fns";

export function dayRangeInTz(date: Date, timezone: string) {
  const zoned = toZonedTime(date, timezone);
  const startLocal = startOfDay(zoned);
  const endLocal = endOfDay(zoned);
  return {
    start: fromZonedTime(startLocal, timezone),
    end: fromZonedTime(endLocal, timezone),
  };
}

export function todayIsoDate(timezone: string, d: Date = new Date()) {
  const zoned = toZonedTime(d, timezone);
  return formatISO(zoned, { representation: "date" });
}

export function yesterdayIsoDate(timezone: string, d: Date = new Date()) {
  const zoned = toZonedTime(d, timezone);
  return formatISO(addDays(zoned, -1), { representation: "date" });
}

// "2026-04-24T08:44:02+08:00 (Asia/Shanghai, 星期五)"
// Passed to the LLM so it doesn't have to convert UTC to the user's zone
// itself — llama-3.3-70b gets that step wrong on '今天晚上6点' roughly half
// the time.
export function localNowForLLM(timezone: string, d: Date = new Date()) {
  const iso = formatTz(d, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: timezone });
  const weekday = formatTz(d, "EEEE", { timeZone: timezone });
  return `${iso} (${timezone}, ${weekday})`;
}
