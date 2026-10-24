import { describe, expect, it } from "vitest";
import { dayKeyOf, daysInMonth, shiftDay, studyStreak, summariseDays } from "@/lib/planner";
import type { PlannerTask } from "@/lib/planner";

/**
 * The planner's day arithmetic and streak rule.
 *
 * Almost every case here is a timezone trap. A study task belongs to a
 * calendar day, and the single most common planner bug is showing Monday's
 * work on Sunday because a day got treated as an instant.
 */

const task = (
  id: string,
  scheduledOn: string,
  durationMinutes = 60,
  completedAt: Date | null = null,
): PlannerTask => ({ id, scheduledOn, durationMinutes, completedAt });

describe("the calendar day an instant falls on", () => {
  it("uses IST, not the server's zone", () => {
    // 19:00 UTC on the 24th is 00:30 on the 25th in IST. A planner that read
    // this as the 24th would file the evening's work under yesterday.
    expect(dayKeyOf(new Date("2026-10-24T19:00:00.000Z"))).toBe("2026-10-25");
    expect(dayKeyOf(new Date("2026-10-24T18:00:00.000Z"))).toBe("2026-10-24");
  });

  it("puts midnight IST on the right side of the boundary", () => {
    // 18:30 UTC is exactly midnight IST.
    expect(dayKeyOf(new Date("2026-10-24T18:29:59.000Z"))).toBe("2026-10-24");
    expect(dayKeyOf(new Date("2026-10-24T18:30:00.000Z"))).toBe("2026-10-25");
  });

  it("does not drift across a month or year boundary", () => {
    expect(dayKeyOf(new Date("2026-10-31T18:30:00.000Z"))).toBe("2026-11-01");
    expect(dayKeyOf(new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("shifting a day", () => {
  it("moves forward and back", () => {
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDay("2026-10-24", -1)).toBe("2026-10-23");
  });

  it("crosses month ends", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("crosses a year end", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2028-02-29", 1)).toBe("2028-03-01");
    // 2027 is not a leap year.
    expect(shiftDay("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("the days of a month", () => {
  it("gives every day and stops at the end", () => {
    const days = daysInMonth("2026-10");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-10-01");
    expect(days[30]).toBe("2026-10-31");
  });

  it("knows February's length in both kinds of year", () => {
    expect(daysInMonth("2027-02")).toHaveLength(28);
    expect(daysInMonth("2028-02")).toHaveLength(29);
  });
});

describe("a day's progress", () => {
  it("counts completed tasks towards the day's total", () => {
    // Dropping them would make a finished day look empty and read 0% exactly
    // when it should read 100%.
    const summary = summariseDays([
      task("a", "2026-10-24", 60, new Date("2026-10-24T10:00:00.000Z")),
      task("b", "2026-10-24", 30, new Date("2026-10-24T11:00:00.000Z")),
    ]).get("2026-10-24")!;

    expect(summary.total).toBe(2);
    expect(summary.done).toBe(2);
    expect(summary.percent).toBe(100);
    expect(summary.minutes).toBe(90);
    expect(summary.doneMinutes).toBe(90);
  });

  it("reports a partial day honestly", () => {
    const summary = summariseDays([
      task("a", "2026-10-24", 60, new Date("2026-10-24T10:00:00.000Z")),
      task("b", "2026-10-24", 60),
      task("c", "2026-10-24", 60),
    ]).get("2026-10-24")!;
    expect(summary.percent).toBe(33);
    expect(summary.doneMinutes).toBe(60);
  });

  it("keeps days separate", () => {
    const days = summariseDays([task("a", "2026-10-24"), task("b", "2026-10-25")]);
    expect(days.get("2026-10-24")!.total).toBe(1);
    expect(days.get("2026-10-25")!.total).toBe(1);
  });

  it("returns nothing at all for a day with no tasks, rather than a zero row", () => {
    expect(summariseDays([]).size).toBe(0);
  });
});

describe("the study streak", () => {
  const NOW = new Date("2026-10-24T12:00:00.000Z"); // 17:30 IST on the 24th
  const doneOn = (day: string) =>
    // 10:00 IST on the given day.
    task(day, day, 60, new Date(`${day}T04:30:00.000Z`));

  it("is zero for a student who has completed nothing", () => {
    // No starting bonus. Inventing a streak for someone who has done nothing
    // makes every other number on the page suspect.
    expect(studyStreak([], NOW)).toEqual({ current: 0, longest: 0, lastActiveDay: null });
    expect(studyStreak([task("a", "2026-10-24")], NOW).current).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const streak = studyStreak(
      [doneOn("2026-10-22"), doneOn("2026-10-23"), doneOn("2026-10-24")],
      NOW,
    );
    expect(streak.current).toBe(3);
    expect(streak.lastActiveDay).toBe("2026-10-24");
  });

  it("survives today having no work yet", () => {
    // The day is still in progress. A counter that resets at midnight and
    // reappears after the evening's first task is just noise.
    const streak = studyStreak([doneOn("2026-10-22"), doneOn("2026-10-23")], NOW);
    expect(streak.current).toBe(2);
  });

  it("breaks when yesterday was missed", () => {
    const streak = studyStreak([doneOn("2026-10-21"), doneOn("2026-10-22")], NOW);
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(2);
    expect(streak.lastActiveDay).toBe("2026-10-22");
  });

  it("counts work, not intentions", () => {
    // Days that merely had tasks scheduled do not count. A streak that
    // rewards planning rather than doing rewards nothing.
    const streak = studyStreak(
      [doneOn("2026-10-24"), task("x", "2026-10-23"), task("y", "2026-10-22")],
      NOW,
    );
    expect(streak.current).toBe(1);
  });

  it("counts a day once however much was done on it", () => {
    const streak = studyStreak(
      [doneOn("2026-10-24"), { ...doneOn("2026-10-24"), id: "second" }],
      NOW,
    );
    expect(streak.current).toBe(1);
  });

  it("remembers the longest run even after it is broken", () => {
    const streak = studyStreak(
      [
        doneOn("2026-10-01"),
        doneOn("2026-10-02"),
        doneOn("2026-10-03"),
        doneOn("2026-10-04"),
        doneOn("2026-10-23"),
        doneOn("2026-10-24"),
      ],
      NOW,
    );
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(4);
  });

  it("counts a run that crosses a month boundary", () => {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const streak = studyStreak(
      [doneOn("2026-10-31"), doneOn("2026-11-01"), doneOn("2026-11-02")],
      now,
    );
    expect(streak.current).toBe(3);
  });

  it("files late-evening work on the right day", () => {
    // 23:00 IST on the 24th is 17:30 UTC — still the 24th, and the streak
    // must not treat it as the 25th.
    const late = task("late", "2026-10-24", 60, new Date("2026-10-24T17:30:00.000Z"));
    const streak = studyStreak([doneOn("2026-10-23"), late], NOW);
    expect(streak.current).toBe(2);
    expect(streak.lastActiveDay).toBe("2026-10-24");
  });
});
