// Mon 00:00 → next Mon 00:00 of the current week, in a given IANA timezone,
// returned as real instants (Date). Used to feed the allocation engine.

/** Offset (minutes) of `timeZone` from UTC at instant `d`. */
function offsetMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - d.getTime()) / 60_000);
}

/** The instant at which it is 00:00 on y-m-d in `timeZone`. */
function midnightIn(y: number, m: number, d: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
}

export function weekInTimezone(now: Date, timeZone: string): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayIdx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  // Date.UTC handles day underflow/overflow across months.
  const monday = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")) - dayIdx));
  const y = monday.getUTCFullYear(), m = monday.getUTCMonth() + 1, d = monday.getUTCDate();
  const start = midnightIn(y, m, d, timeZone);
  const nextMon = new Date(Date.UTC(y, m - 1, d + 7));
  const end = midnightIn(nextMon.getUTCFullYear(), nextMon.getUTCMonth() + 1, nextMon.getUTCDate(), timeZone);
  return { start, end };
}
