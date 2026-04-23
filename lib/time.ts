import { toZonedTime, fromZonedTime } from "date-fns-tz";
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

export function hourInTz(timezone: string, d: Date = new Date()) {
  const zoned = toZonedTime(d, timezone);
  return zoned.getHours();
}
