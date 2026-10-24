/**
 * Display formatting.
 *
 * Every timestamp is stored in UTC and rendered in IST. A placement round at
 * 23:30 IST is 18:00 UTC on the same day, and a naive `toLocaleString()` on a
 * server running in UTC shows it on the right day by luck rather than by
 * design — until the server moves. So the zone is named explicitly, every time.
 */

export const IST = "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "Mon, 27 Oct, 10:00" */
export function formatIst(value: Date | string): string {
  return dateTime.format(asDate(value)).replace(/ /g, " ");
}

/** "Mon, 27 Oct" */
export function formatIstDate(value: Date | string): string {
  return dateOnly.format(asDate(value));
}

/** "10:00" */
export function formatIstTime(value: Date | string): string {
  return timeOnly.format(asDate(value)).replace(/ /g, " ");
}

/** "10:00–11:30" */
export function formatIstWindow(start: Date | string, end: Date | string): string {
  return `${formatIstTime(start)}–${formatIstTime(end)}`;
}

/** The IST calendar day as `YYYY-MM-DD`, used to group an agenda. */
export function istDayKey(value: Date | string): string {
  const d = asDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

/** "in 3 days", "tomorrow", "in 4 hours", "2 days ago" */
export function relativeToNow(value: Date | string, now: Date = new Date()): string {
  const target = asDate(value).getTime();
  const diff = target - now.getTime();
  const past = diff < 0;
  const hours = Math.abs(diff) / 3_600_000;

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(Math.abs(diff) / 60_000));
    return past ? `${minutes} min ago` : `in ${minutes} min`;
  }
  if (hours < 24) {
    const h = Math.round(hours);
    return past ? `${h} hour${h === 1 ? "" : "s"} ago` : `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  if (!past && days === 1) return "tomorrow";
  if (past && days === 1) return "yesterday";
  return past ? `${days} days ago` : `in ${days} days`;
}

export function formatLpa(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} LPA`;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * A UTC instant as the `YYYY-MM-DDTHH:mm` string an `<input type="datetime-local">`
 * expects, expressed in IST.
 *
 * The pair below deliberately ignores the browser's own time zone. Placement
 * rounds are announced in IST, so a student demoing the app from a laptop still
 * set to another zone must not see every round shift by hours.
 */
export function istInputValue(value: Date | string): string {
  const shifted = new Date(asDate(value).getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** The inverse: an IST wall-clock string back to a UTC ISO instant. */
export function istInputToUtc(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const ms = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString();
}
