import { describe, expect, it } from "vitest";
import { ASSESS_HOURS, HOURS_PER_LEVEL, SESSION_HOURS, analyseGaps, buildPlan } from "@/lib/jd";
import type { ExtractedSkill, PlanSettings, Proficiency, StudentSkill } from "@/lib/jd";

/**
 * The study plan.
 *
 * Two properties carry the module. It is derived, so completion survives every
 * rebuild without anything having to remember to preserve it. And when the
 * time does not fit the work, it says so rather than cramming — a plan you
 * cannot finish is worse than one that tells you what it left out.
 */

const START = new Date("2026-10-24T09:30:00+05:30");

const skill = (
  id: string,
  importance: "required" | "preferred",
): ExtractedSkill => ({
  id,
  label: id.toUpperCase(),
  category: "language",
  importance,
  source: "explicit",
  evidence: `mentions ${id}`,
});

const rated = (skillId: string, level: Proficiency): StudentSkill => ({
  skillId,
  level,
  source: "self_reported",
});

const settings = (over: Partial<PlanSettings> = {}): PlanSettings => ({
  hoursPerDay: 2,
  deadline: null,
  completedTaskIds: [],
  ...over,
});

const plan = (
  skills: ExtractedSkill[],
  student: StudentSkill[],
  over: Partial<PlanSettings> = {},
) => buildPlan({ gaps: analyseGaps(skills, student).gaps, settings: settings(over), startOn: START });

const allTasks = (p: ReturnType<typeof buildPlan>) => p.days.flatMap((d) => d.tasks);

describe("what each gap is worth", () => {
  it("spends more on a required gap than a preferred one", () => {
    const required = plan([skill("java", "required")], [rated("java", "none")]);
    const preferred = plan([skill("go", "preferred")], [rated("go", "none")]);
    expect(required.summary.totalHours).toBeGreaterThan(preferred.summary.totalHours);
  });

  it("scales with how far below target the student is", () => {
    // none -> intermediate is two levels; beginner -> intermediate is one.
    const far = plan([skill("java", "required")], [rated("java", "none")]);
    const near = plan([skill("java", "required")], [rated("java", "beginner")]);
    expect(far.summary.totalHours).toBe(2 * HOURS_PER_LEVEL.required);
    expect(near.summary.totalHours).toBe(1 * HOURS_PER_LEVEL.required);
  });

  it("schedules nothing for a skill already at target", () => {
    const p = plan([skill("java", "required")], [rated("java", "advanced")]);
    expect(allTasks(p)).toHaveLength(0);
    expect(p.summary.totalHours).toBe(0);
  });

  it("gives an unrated skill a short slot to assess, not a study block", () => {
    // You cannot size work for a gap nobody has measured, and guessing would
    // schedule hours against a gap that may not exist.
    const p = plan([skill("java", "required")], []);
    const tasks = allTasks(p);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe("assess");
    expect(tasks[0].hours).toBe(ASSESS_HOURS);
    expect(tasks[0].objective).toContain("where you stand");
    expect(p.notes.join(" ")).toContain("not a study block");
  });
});

describe("sittings", () => {
  it("never schedules a block longer than one sitting", () => {
    const p = plan([skill("java", "required")], [rated("java", "none")], { hoursPerDay: 8 });
    for (const task of allTasks(p)) {
      expect(task.hours).toBeLessThanOrEqual(SESSION_HOURS);
    }
  });

  it("never schedules a block the day cannot hold", () => {
    const p = plan([skill("java", "required")], [rated("java", "none")], { hoursPerDay: 1 });
    for (const task of allTasks(p)) expect(task.hours).toBeLessThanOrEqual(1);
  });

  it("respects the daily budget", () => {
    const p = plan(
      [skill("a", "required"), skill("b", "required"), skill("c", "required")],
      [rated("a", "none"), rated("b", "none"), rated("c", "none")],
      { hoursPerDay: 2 },
    );
    for (const day of p.days) expect(day.hours).toBeLessThanOrEqual(2);
  });
});

describe("order follows the gap analysis", () => {
  it("schedules required work before preferred work", () => {
    const p = plan(
      [skill("pref", "preferred"), skill("req", "required")],
      [rated("pref", "none"), rated("req", "none")],
      { hoursPerDay: 2 },
    );
    const first = allTasks(p).find((t) => t.skillId === "req");
    const later = allTasks(p).find((t) => t.skillId === "pref");
    expect(first!.dayOffset).toBeLessThanOrEqual(later!.dayOffset);
  });

  it("does not quietly re-rank what the gap list showed", () => {
    // The student has just read the gap order; the schedule must agree with it.
    const gaps = analyseGaps(
      [skill("pref", "preferred"), skill("req", "required")],
      [rated("pref", "none"), rated("req", "beginner")],
    ).gaps;
    const p = buildPlan({ gaps, settings: settings(), startOn: START });
    const order = [...new Set(allTasks(p).map((t) => t.skillId))];
    expect(order[0]).toBe("req");
  });
});

describe("when the time does not fit", () => {
  // Three required skills from scratch is 18 hours; two days at two hours is 4.
  const skills = [skill("a", "required"), skill("b", "required"), skill("c", "required")];
  const student = [rated("a", "none"), rated("b", "none"), rated("c", "none")];
  const tight = plan(skills, student, {
    hoursPerDay: 2,
    deadline: new Date("2026-10-25T23:59:00+05:30"),
  });

  it("schedules only what fits", () => {
    expect(tight.summary.totalHours).toBeLessThanOrEqual(tight.summary.hoursAvailable);
  });

  it("reports the rest instead of cramming it into the last day", () => {
    expect(tight.uncovered.length).toBeGreaterThan(0);
    for (const day of tight.days) expect(day.hours).toBeLessThanOrEqual(2);
  });

  it("names how many hours short each one is", () => {
    for (const u of tight.uncovered) expect(u.hoursShort).toBeGreaterThan(0);
  });

  it("says plainly that required work was left out", () => {
    expect(tight.summary.requiredUncovered).toBeGreaterThan(0);
    expect(tight.notes.join(" ")).toContain("required for the role");
    expect(tight.notes.join(" ")).toContain("worse than one that tells you what it left out");
  });

  it("drops the lowest-priority work, never the required work first", () => {
    const mixed = plan(
      [skill("req", "required"), skill("pref", "preferred")],
      [rated("req", "none"), rated("pref", "none")],
      { hoursPerDay: 2, deadline: new Date("2026-10-25T23:59:00+05:30") },
    );
    // Four hours of room, six of required work: the preferred skill is the one
    // that goes entirely.
    expect(mixed.uncovered.map((u) => u.skillId)).toContain("pref");
  });

  it("handles a deadline that has already gone", () => {
    const past = plan(skills, student, {
      hoursPerDay: 2,
      deadline: new Date("2026-10-20T23:59:00+05:30"),
    });
    expect(past.days).toEqual([]);
    expect(past.summary.daysAvailable).toBe(0);
    expect(past.notes.join(" ")).toContain("deadline has already passed");
    expect(past.uncovered.length).toBe(skills.length);
  });
});

describe("the deadline", () => {
  it("counts today, so a deadline tomorrow leaves two days", () => {
    const p = plan([skill("a", "required")], [rated("a", "none")], {
      deadline: new Date("2026-10-25T23:59:00+05:30"),
    });
    expect(p.summary.daysAvailable).toBe(2);
  });

  it("falls back to a horizon when there is none", () => {
    const p = plan([skill("a", "required")], [rated("a", "none")]);
    expect(p.summary.daysAvailable).toBe(14);
  });

  it("anchors days to midnight, so a late-evening plan does not lose one", () => {
    const late = buildPlan({
      gaps: analyseGaps([skill("a", "required")], [rated("a", "none")]).gaps,
      settings: settings({ deadline: new Date("2026-10-26T23:59:00+05:30") }),
      startOn: new Date("2026-10-24T23:50:00+05:30"),
    });
    expect(late.summary.daysAvailable).toBe(3);
  });
});

describe("completion survives every rebuild", () => {
  const skills = [skill("a", "required"), skill("b", "required")];
  const student = [rated("a", "none"), rated("b", "none")];

  it("gives tasks ids that do not move between builds", () => {
    const first = allTasks(plan(skills, student)).map((t) => t.id);
    const second = allTasks(plan(skills, student)).map((t) => t.id);
    expect(second).toEqual(first);
  });

  it("marks the ticked ones done", () => {
    const ids = allTasks(plan(skills, student)).map((t) => t.id);
    const p = plan(skills, student, { completedTaskIds: [ids[0], ids[1]] });
    expect(p.summary.doneTasks).toBe(2);
    expect(allTasks(p).filter((t) => t.done)).toHaveLength(2);
  });

  it("keeps ticks when the settings change underneath them", () => {
    // The whole point of deriving the plan: moving the deadline reshapes the
    // schedule and cannot lose the work already done.
    const ids = allTasks(plan(skills, student)).map((t) => t.id);
    const rebuilt = plan(skills, student, {
      completedTaskIds: [ids[0]],
      hoursPerDay: 5,
      deadline: new Date("2026-10-30T23:59:00+05:30"),
    });
    expect(allTasks(rebuilt).find((t) => t.id === ids[0])?.done).toBe(true);
  });

  it("keeps ticks when a rating changes and the gap shrinks", () => {
    const ids = allTasks(plan(skills, student)).map((t) => t.id);
    const improved = plan(skills, [rated("a", "beginner"), rated("b", "none")], {
      completedTaskIds: ids.slice(0, 1),
    });
    const kept = allTasks(improved).filter((t) => t.done);
    expect(kept.length).toBeGreaterThan(0);
  });

  it("does not let a finished task eat capacity it has already spent", () => {
    const ids = allTasks(plan(skills, student, { hoursPerDay: 2 })).map((t) => t.id);
    const withDone = plan(skills, student, { hoursPerDay: 2, completedTaskIds: ids.slice(0, 2) });
    const outstanding = allTasks(withDone).filter((t) => !t.done).length;
    const fresh = allTasks(plan(skills, student, { hoursPerDay: 2 })).length;
    expect(outstanding).toBeLessThan(fresh);
  });
});

describe("what it refuses to claim", () => {
  const p = plan([skill("a", "required")], [rated("a", "advanced")]);

  it("calls its durations estimates", () => {
    expect(p.notes.join(" ")).toContain("rough estimates, not a syllabus");
  });

  it("never promises readiness or a result", () => {
    const text = p.notes.join(" ").toLowerCase();
    for (const word of ["ready", "will pass", "guarantee", "ensure you"]) {
      expect(text, word).not.toContain(word);
    }
  });
});

describe("edge cases", () => {
  it("returns an empty plan for a description with no skills", () => {
    const p = plan([], []);
    expect(p.days).toEqual([]);
    expect(p.uncovered).toEqual([]);
    expect(p.summary.totalTasks).toBe(0);
  });

  it("tolerates a nonsensical daily budget", () => {
    const p = plan([skill("a", "required")], [rated("a", "none")], { hoursPerDay: 0 });
    expect(p.days.length).toBeGreaterThan(0);
    for (const day of p.days) expect(day.hours).toBeGreaterThan(0);
  });

  it("omits days with nothing on them", () => {
    const p = plan([skill("a", "required")], [rated("a", "beginner")], { hoursPerDay: 8 });
    expect(p.days).toHaveLength(1);
  });
});
