import { describe, expect, it } from "vitest";
import { describeWhen, priorityItems } from "@/lib/dashboard";
import type { DashboardInput } from "@/lib/dashboard";

/**
 * What the dashboard puts in front of the student.
 *
 * The rule these tests enforce is that nothing appears without a reason, and
 * the thing that expires soonest leads. A dashboard that manufactures work to
 * look busy is one the student learns to scroll past.
 */

const NOW = new Date("2026-10-25T12:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const base: DashboardInput = {
  now: NOW,
  profileIsUsable: true,
  openDrives: [],
  todayTasks: [],
  overdueTaskCount: 0,
  criticalGaps: [],
  weakAssessments: [],
};

const drive = (over: Partial<DashboardInput["openDrives"][0]> = {}) => ({
  id: "d1",
  company: "Zoho",
  role: "MTS",
  applicationDeadline: inDays(1),
  hasApplied: false,
  ...over,
});

describe("an empty board", () => {
  it("produces nothing rather than filler", () => {
    // Saying "there is nothing pressing" is more useful than inventing a task.
    expect(priorityItems(base)).toEqual([]);
  });
});

describe("an unusable profile", () => {
  it("leads, because nothing else on the board means anything without it", () => {
    const items = priorityItems({
      ...base,
      profileIsUsable: false,
      openDrives: [drive()],
    });
    expect(items[0].kind).toBe("profile_incomplete");
  });
});

describe("drive deadlines", () => {
  it("surfaces one closing soon", () => {
    const items = priorityItems({ ...base, openDrives: [drive()] });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("drive_deadline");
    expect(items[0].when).toBe("Tomorrow");
    expect(items[0].urgency).toBe("critical");
  });

  it("orders the tightest deadline first", () => {
    const items = priorityItems({
      ...base,
      openDrives: [
        drive({ id: "far", company: "Far", applicationDeadline: inDays(5) }),
        drive({ id: "near", company: "Near", applicationDeadline: inDays(1) }),
      ],
    });
    expect(items.map((i) => i.title)).toEqual(["Apply to Near", "Apply to Far"]);
  });

  it("ignores one the student has already applied to", () => {
    // The deadline has stopped being their problem.
    expect(priorityItems({ ...base, openDrives: [drive({ hasApplied: true })] })).toEqual([]);
  });

  it("ignores one more than a week out", () => {
    // Real, but not a thing to do today.
    expect(
      priorityItems({ ...base, openDrives: [drive({ applicationDeadline: inDays(20) })] }),
    ).toEqual([]);
  });

  it("ignores one that has already closed", () => {
    expect(
      priorityItems({ ...base, openDrives: [drive({ applicationDeadline: inDays(-1) })] }),
    ).toEqual([]);
  });

  it("ignores one with no deadline stated", () => {
    expect(
      priorityItems({ ...base, openDrives: [drive({ applicationDeadline: null })] }),
    ).toEqual([]);
  });

  it("softens the urgency as the deadline recedes", () => {
    const at = (d: number) =>
      priorityItems({ ...base, openDrives: [drive({ applicationDeadline: inDays(d) })] })[0]
        .urgency;
    expect(at(1)).toBe("critical");
    expect(at(3)).toBe("soon");
    expect(at(6)).toBe("normal");
  });
});

describe("study tasks", () => {
  it("counts only the ones still open", () => {
    const items = priorityItems({
      ...base,
      todayTasks: [
        { id: "a", title: "DSA", done: true, durationMinutes: 60 },
        { id: "b", title: "SQL", done: false, durationMinutes: 90 },
      ],
    });
    expect(items[0].title).toBe("1 study task today");
    expect(items[0].detail).toContain("1.5 hours");
  });

  it("says nothing when the day is already done", () => {
    expect(
      priorityItems({
        ...base,
        todayTasks: [{ id: "a", title: "DSA", done: true, durationMinutes: 60 }],
      }),
    ).toEqual([]);
  });

  it("flags tasks that slipped past their day", () => {
    const items = priorityItems({ ...base, overdueTaskCount: 3 });
    expect(items[0].when).toBe("Overdue");
    expect(items[0].title).toContain("3 tasks");
  });
});

describe("ordering across kinds", () => {
  it("puts an expiring deadline above study work", () => {
    // The deadline is the only item on the list that expires.
    const items = priorityItems({
      ...base,
      openDrives: [drive()],
      todayTasks: [{ id: "a", title: "DSA", done: false, durationMinutes: 60 }],
      criticalGaps: [{ skillId: "sql", label: "SQL", jobDescriptionId: "jd1" }],
      weakAssessments: [{ skillId: "os", label: "OS", scorePercent: 25 }],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "drive_deadline",
      "study_task",
      "skill_gap",
      "assessment_weak",
    ]);
  });

  it("caps the list rather than showing everything at once", () => {
    const items = priorityItems(
      {
        ...base,
        openDrives: Array.from({ length: 10 }, (_, i) =>
          drive({ id: `d${i}`, company: `C${i}`, applicationDeadline: inDays(1 + i * 0.1) }),
        ),
      },
      4,
    );
    expect(items).toHaveLength(4);
  });

  it("links every item somewhere real", () => {
    const items = priorityItems({
      ...base,
      profileIsUsable: false,
      openDrives: [drive()],
      todayTasks: [{ id: "a", title: "DSA", done: false, durationMinutes: 60 }],
      criticalGaps: [{ skillId: "sql", label: "SQL", jobDescriptionId: "jd1" }],
      weakAssessments: [{ skillId: "os", label: "OS", scorePercent: 25 }],
    });
    for (const item of items) {
      expect(item.href.startsWith("/"), item.title).toBe(true);
      expect(item.detail.length, item.title).toBeGreaterThan(10);
    }
  });
});

describe("how a deadline is described", () => {
  it("counts hours inside a day", () => {
    expect(describeWhen(new Date(NOW.getTime() + 3 * 3600_000), NOW)).toBe("in 3 hours");
  });

  it("says tomorrow rather than in 1 day", () => {
    expect(describeWhen(inDays(1), NOW)).toBe("Tomorrow");
  });

  it("counts days beyond that", () => {
    expect(describeWhen(inDays(4), NOW)).toBe("in 4 days");
  });

  it("does not describe a passed deadline as upcoming", () => {
    expect(describeWhen(inDays(-1), NOW)).toBe("Closed");
  });
});
