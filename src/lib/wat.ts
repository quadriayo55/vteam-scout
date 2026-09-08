/** West Africa Time (UTC+1) helpers — all app figures are locked to Lagos time. */
const WAT_OFFSET_MS = 60 * 60 * 1000;

export function watDayKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(d.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the WAT day that is `daysAgo` days back, as a UTC instant. */
export function watDayStart(daysAgo = 0): Date {
  const now = new Date();
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  wat.setUTCHours(0, 0, 0, 0);
  wat.setUTCDate(wat.getUTCDate() - daysAgo);
  return new Date(wat.getTime() - WAT_OFFSET_MS);
}

export function watDayKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(watDayKey(new Date(watDayStart(i).getTime() + WAT_OFFSET_MS + 1)));
  }
  return keys;
}

export function formatWat(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatWatDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}
