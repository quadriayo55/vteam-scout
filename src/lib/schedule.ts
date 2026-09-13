/** Turning "day 4 at 9:00 in Lagos" into a real moment in time. */

function partsIn(timeZone: string, date: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map["year"] ?? 1970,
    month: map["month"] ?? 1,
    day: map["day"] ?? 1,
    hour: map["hour"] ?? 0,
    minute: map["minute"] ?? 0,
    second: map["second"] ?? 0,
  };
}

/** The UTC instant matching a wall-clock time in the given zone. */
export function zonedInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i += 1) {
    const shown = partsIn(timeZone, new Date(guess));
    const shownUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    guess += Date.UTC(year, month - 1, day, hour, minute, 0) - shownUtc;
  }
  return new Date(guess);
}

/** N days after a moment, at a fixed local send time. */
export function localSendTime(
  from: Date | string,
  days: number,
  timeZone: string,
  hour: number,
  minute: number,
): Date {
  const base = typeof from === "string" ? new Date(from) : from;
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const parts = partsIn(timeZone, shifted);
  return zonedInstant(timeZone, parts.year, parts.month, parts.day, hour, minute);
}
