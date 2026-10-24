import { describe, expect, it } from "vitest";
import { buildCalendar, escapeIcsText, foldIcsLine, toIcsUtc } from "@/lib/ics";

describe("escaping", () => {
  it("escapes commas, which otherwise split a value into two", () => {
    expect(escapeIcsText("Deloitte, India")).toBe("Deloitte\\, India");
  });

  it("escapes semicolons, which otherwise start a parameter", () => {
    expect(escapeIcsText("Round 1; online")).toBe("Round 1\\; online");
  });

  it("doubles a backslash before adding escapes, not after", () => {
    expect(escapeIcsText("a\\b,c")).toBe("a\\\\b\\,c");
  });

  it("turns real newlines into the literal two-character escape", () => {
    expect(escapeIcsText("line one\nline two")).toBe("line one\\nline two");
    expect(escapeIcsText("crlf\r\nhere")).toBe("crlf\\nhere");
  });
});

describe("UTC stamps", () => {
  it("formats as a basic-format UTC timestamp", () => {
    expect(toIcsUtc(new Date("2026-10-27T04:30:00.000Z"))).toBe("20261027T043000Z");
  });

  it("pads single-digit components", () => {
    expect(toIcsUtc(new Date("2026-01-02T03:04:05.000Z"))).toBe("20260102T030405Z");
  });
});

describe("line folding", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds a long line with CRLF and a single leading space", () => {
    const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBe(75);
    for (const line of lines.slice(1)) {
      expect(line.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("reconstructs to the original when unfolded", () => {
    const original = `DESCRIPTION:${"ab".repeat(120)}`;
    const unfolded = foldIcsLine(original).split("\r\n ").join("");
    expect(unfolded).toBe(original);
  });

  it("counts octets rather than characters, and never splits a character", () => {
    // Each of these is three octets in UTF-8, so 40 of them exceed 75 octets
    // while being only 40 characters long.
    const line = `SUMMARY:${"₹".repeat(40)}`;
    const folded = foldIcsLine(line);
    expect(folded).toContain("\r\n ");
    for (const part of folded.split("\r\n")) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    }
    // No replacement characters, which is what a mid-sequence split produces.
    expect(folded).not.toContain("�");
    expect(folded.split("\r\n ").join("")).toBe(line);
  });
});

describe("buildCalendar", () => {
  const event = {
    uid: "round-1@roundready",
    start: new Date("2026-10-27T04:30:00.000Z"),
    end: new Date("2026-10-27T06:00:00.000Z"),
    summary: "Zoho — Online Test",
    description: "Eligible. Clashes with TCS Digital.",
    location: "Online",
  };

  it("wraps events in a valid calendar envelope", () => {
    const ics = buildCalendar([event], { now: new Date("2026-10-23T06:00:00.000Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("uses CRLF throughout, as the specification requires", () => {
    const ics = buildCalendar([event]);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("carries the start, end and summary of each event", () => {
    const ics = buildCalendar([event]);
    expect(ics).toContain("DTSTART:20261027T043000Z");
    expect(ics).toContain("DTEND:20261027T060000Z");
    expect(ics).toContain("SUMMARY:Zoho — Online Test");
  });

  it("escapes a description containing punctuation", () => {
    const ics = buildCalendar([{ ...event, description: "Clashes with Infosys, 10:00" }]);
    expect(ics).toContain("DESCRIPTION:Clashes with Infosys\\, 10:00");
  });

  it("omits optional fields that are absent rather than emitting empty ones", () => {
    const ics = buildCalendar([
      { uid: "u", start: event.start, end: event.end, summary: "Bare" },
    ]);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });

  it("produces an empty but valid calendar when there is nothing scheduled", () => {
    const ics = buildCalendar([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("writes one VEVENT per event", () => {
    const ics = buildCalendar([event, { ...event, uid: "round-2@roundready" }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
