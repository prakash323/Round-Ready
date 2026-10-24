import { describe, expect, it } from "vitest";
import {
  formatIst,
  formatIstDate,
  formatIstTime,
  formatIstWindow,
  formatLpa,
  istDayKey,
  istInputToUtc,
  istInputValue,
  relativeToNow,
} from "@/lib/format";
import { NOW, fromNow } from "./fixtures";

/**
 * Time zones.
 *
 * These tests exist because a round at 23:30 IST is 18:00 UTC, and a server
 * that formats without naming the zone shows it on the right day only by
 * accident of where it is deployed.
 */

describe("IST rendering", () => {
  it("renders a late-evening IST round on the correct day", () => {
    // 2026-10-27T18:00:00Z is 23:30 IST on 27 October, not 28 October.
    const late = new Date("2026-10-27T18:00:00.000Z");
    expect(formatIstTime(late)).toBe("23:30");
    expect(formatIstDate(late)).toContain("27 Oct");
    expect(istDayKey(late)).toBe("2026-10-27");
  });

  it("renders a just-past-midnight UTC time on the previous IST day", () => {
    // 2026-10-28T00:30:00Z is 06:00 IST on 28 October.
    const early = new Date("2026-10-28T00:30:00.000Z");
    expect(formatIstTime(early)).toBe("06:00");
    expect(istDayKey(early)).toBe("2026-10-28");
  });

  it("renders a UTC time that falls before IST midnight on the next IST day", () => {
    // 2026-10-27T19:00:00Z is 00:30 IST on 28 October.
    const rollover = new Date("2026-10-27T19:00:00.000Z");
    expect(formatIstTime(rollover)).toBe("00:30");
    expect(istDayKey(rollover)).toBe("2026-10-28");
  });

  it("uses a 24-hour clock so 14:00 is never read as 2 a.m.", () => {
    expect(formatIstTime(new Date("2026-10-27T08:30:00.000Z"))).toBe("14:00");
  });

  it("formats a window with an en dash", () => {
    const start = new Date("2026-10-27T04:30:00.000Z"); // 10:00 IST
    const end = new Date("2026-10-27T06:00:00.000Z"); // 11:30 IST
    expect(formatIstWindow(start, end)).toBe("10:00–11:30");
  });

  it("accepts an ISO string as well as a Date, because JSON has no Date", () => {
    const iso = "2026-10-27T04:30:00.000Z";
    expect(formatIstTime(iso)).toBe(formatIstTime(new Date(iso)));
    expect(formatIst(iso)).toBe(formatIst(new Date(iso)));
  });

  it("includes the weekday, which is what a student actually navigates by", () => {
    expect(formatIst(new Date("2026-10-27T04:30:00.000Z"))).toMatch(/Tue/);
  });
});

describe("relative time", () => {
  it("describes minutes, hours and days", () => {
    expect(relativeToNow(new Date(NOW.getTime() + 20 * 60_000), NOW)).toBe("in 20 min");
    expect(relativeToNow(new Date(NOW.getTime() + 4 * 3_600_000), NOW)).toBe("in 4 hours");
    expect(relativeToNow(fromNow(3), NOW)).toBe("in 3 days");
  });

  it("says tomorrow and yesterday rather than 'in 1 days'", () => {
    expect(relativeToNow(fromNow(1), NOW)).toBe("tomorrow");
    expect(relativeToNow(fromNow(-1), NOW)).toBe("yesterday");
  });

  it("marks the past as the past", () => {
    expect(relativeToNow(fromNow(-5), NOW)).toBe("5 days ago");
    expect(relativeToNow(new Date(NOW.getTime() - 30 * 60_000), NOW)).toBe("30 min ago");
  });

  it("never says 'in 0 min'", () => {
    expect(relativeToNow(new Date(NOW.getTime() + 1_000), NOW)).toBe("in 1 min");
  });
});

describe("CTC formatting", () => {
  it("drops a meaningless decimal", () => {
    expect(formatLpa(12)).toBe("12 LPA");
  });

  it("keeps a meaningful one", () => {
    expect(formatLpa(6.5)).toBe("6.5 LPA");
  });
});

describe("datetime-local round trip", () => {
  it("renders a UTC instant as its IST wall-clock value", () => {
    // 18:00 UTC is 23:30 IST on the same calendar day.
    expect(istInputValue(new Date("2026-10-27T18:00:00.000Z"))).toBe("2026-10-27T23:30");
  });

  it("parses an IST wall-clock value back to the same UTC instant", () => {
    expect(istInputToUtc("2026-10-27T23:30")).toBe("2026-10-27T18:00:00.000Z");
  });

  it("round trips without drift across an IST midnight", () => {
    for (const local of [
      "2026-10-27T00:00",
      "2026-10-27T05:29",
      "2026-10-27T05:30",
      "2026-10-27T23:59",
      "2027-01-01T00:15",
    ]) {
      expect(istInputValue(istInputToUtc(local)!)).toBe(local);
    }
  });

  it("ignores the browser's own time zone by construction", () => {
    // The conversion is arithmetic on a fixed +05:30 offset, so the result does
    // not depend on where the test process thinks it is.
    const utc = istInputToUtc("2026-10-27T10:00");
    expect(utc).toBe("2026-10-27T04:30:00.000Z");
  });

  it("returns null for something that is not a datetime-local value", () => {
    expect(istInputToUtc("")).toBeNull();
    expect(istInputToUtc("27/10/2026")).toBeNull();
  });
});
