/**
 * iCalendar (RFC 5545) export.
 *
 * Rounds belong in the calendar the student already checks at breakfast, not
 * only in this tool. The format looks trivial and is not: lines are folded at
 * 75 *octets* rather than characters, and a company name containing a comma
 * silently corrupts the file if it is not escaped. Both are implemented here
 * and both are tested, because a calendar file that imports as one malformed
 * event is worse than no export at all.
 */

export interface CalendarEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
}

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** `20261027T043000Z` — always UTC, so no VTIMEZONE block is needed. */
export function toIcsUtc(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Escape a TEXT value. Order matters: the backslash must be doubled first, or
 * the escapes added afterwards get double-escaped.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold one content line to 75 octets, continuing with CRLF + a single space.
 *
 * The limit is on octets, so the split has to respect UTF-8 boundaries — a
 * company name with a non-ASCII character must not be cut mid-sequence.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = MAX_OCTETS;
  while (offset < bytes.length) {
    let take = Math.min(limit, bytes.length - offset);
    // Walk back off a continuation byte (10xxxxxx) so a multi-byte character
    // is never split across a fold.
    while (take > 1 && (bytes[offset + take] & 0xc0) === 0x80) take -= 1;
    parts.push(bytes.subarray(offset, offset + take).toString("utf8"));
    offset += take;
    limit = MAX_OCTETS - 1; // continuation lines spend one octet on the space
  }
  return parts.join(`${CRLF} `);
}

function line(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`);
}

export function buildCalendar(
  events: CalendarEvent[],
  options: { name?: string; now?: Date } = {},
): string {
  const now = options.now ?? new Date();
  const stamp = toIcsUtc(now);

  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RoundReady//Placement Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", escapeIcsText(options.name ?? "RoundReady")),
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  for (const event of events) {
    out.push("BEGIN:VEVENT");
    out.push(line("UID", event.uid));
    out.push(line("DTSTAMP", stamp));
    out.push(line("DTSTART", toIcsUtc(event.start)));
    out.push(line("DTEND", toIcsUtc(event.end)));
    out.push(line("SUMMARY", escapeIcsText(event.summary)));
    if (event.description) out.push(line("DESCRIPTION", escapeIcsText(event.description)));
    if (event.location) out.push(line("LOCATION", escapeIcsText(event.location)));
    out.push("END:VEVENT");
  }

  out.push("END:VCALENDAR");
  return out.join(CRLF) + CRLF;
}
