import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
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

// "2026-04-24T17:53:30+08:00 (Asia/Shanghai, 星期五)"
// Passed to the LLM so it doesn't have to convert UTC to the user's zone
// itself — llama-3.3-70b gets that step wrong on '今天晚上6点' roughly half
// the time. Uses formatInTimeZone (not format) because the latter's timeZone
// option silently no-ops in some paths, which left us shipping UTC as local.
export function localNowForLLM(timezone: string, d: Date = new Date()) {
  const iso = formatInTimeZone(d, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const weekday = formatInTimeZone(d, timezone, "EEEE");
  return `${iso} (${timezone}, ${weekday})`;
}
