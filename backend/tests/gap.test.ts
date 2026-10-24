import { describe, expect, it } from "vitest";
import { DEFAULT_TARGETS, analyseGaps } from "@/lib/jd";
import type { ExtractedSkill, Proficiency, StudentSkill } from "@/lib/jd";

/**
 * Skill-gap analysis.
 *
 * The case that matters most is the unrated skill. Treating it as zero would
 * send a student to study something they may already know — the same mistake
 * the eligibility engine refuses to make with a blank 12th percentage.
 */

const skill = (
  id: string,
  importance: "required" | "preferred",
  source: ExtractedSkill["source"] = "explicit",
): ExtractedSkill => ({
  id,
  label: id.toUpperCase(),
  category: "language",
  importance,
  source,
  evidence: `line mentioning ${id}`,
});

const rated = (
  skillId: string,
  level: Proficiency,
  source: StudentSkill["source"] = "self_reported",
): StudentSkill => ({ skillId, level, source });

describe("an unrated skill", () => {
  const result = analyseGaps([skill("java", "required")], []);
  const gap = result.gaps[0];

  it("is unknown, not missing", () => {
    expect(gap.status).toBe("unknown");
  });

  it("reports no level rather than defaulting to none", () => {
    expect(gap.level).toBeNull();
  });

  it("does not claim a distance it cannot know", () => {
    expect(gap.distance).toBe(0);
  });

  it("says so in terms the student can act on", () => {
    expect(gap.rationale).toContain("not rated");
    expect(gap.rationale).toContain("undecided rather than zero");
  });

  it("is counted as outstanding, because it might be the biggest gap", () => {
    expect(result.summary.unknown).toBe(1);
    expect(result.summary.requiredOutstanding).toBe(1);
  });
});

describe("status against the suggested target", () => {
  const check = (level: Proficiency, importance: "required" | "preferred" = "required") =>
    analyseGaps([skill("java", importance)], [rated("java", level)]).gaps[0];

  it("required asks for intermediate", () => {
    expect(DEFAULT_TARGETS.required).toBe("intermediate");
    expect(check("none").status).toBe("missing");
    expect(check("beginner").status).toBe("partial");
    expect(check("intermediate").status).toBe("met");
    expect(check("advanced").status).toBe("met");
  });

  it("preferred asks only for beginner", () => {
    expect(DEFAULT_TARGETS.preferred).toBe("beginner");
    expect(check("none", "preferred").status).toBe("missing");
    expect(check("beginner", "preferred").status).toBe("met");
  });

  it("measures the distance in levels below target", () => {
    expect(check("none").distance).toBe(2);
    expect(check("beginner").distance).toBe(1);
    expect(check("intermediate").distance).toBe(0);
  });

  it("takes a custom target table, so a college can set its own bar", () => {
    const strict = analyseGaps([skill("java", "required")], [rated("java", "intermediate")], {
      targets: { required: "advanced", preferred: "intermediate" },
    });
    expect(strict.gaps[0].status).toBe("partial");
    expect(strict.gaps[0].distance).toBe(1);
  });
});

describe("ordering", () => {
  const skills = [
    skill("preferred_missing", "preferred"),
    skill("required_met", "required"),
    skill("required_partial", "required"),
    skill("required_missing", "required"),
    skill("required_unknown", "required"),
    skill("preferred_unknown", "preferred"),
  ];
  const student = [
    rated("preferred_missing", "none"),
    rated("required_met", "advanced"),
    rated("required_partial", "beginner"),
    rated("required_missing", "none"),
  ];
  const order = analyseGaps(skills, student).gaps.map((g) => g.skill.id);

  it("puts required work ahead of preferred work", () => {
    // The product rule: a preferred skill never outranks a required one, even
    // when the preferred gap is numerically larger.
    expect(order.indexOf("required_missing")).toBeLessThan(order.indexOf("preferred_missing"));
    expect(order.indexOf("required_partial")).toBeLessThan(order.indexOf("preferred_missing"));
    expect(order.indexOf("required_unknown")).toBeLessThan(order.indexOf("preferred_missing"));
  });

  it("leads with the required skill not started at all", () => {
    expect(order[0]).toBe("required_missing");
  });

  it("drops anything already met to the bottom", () => {
    expect(order[order.length - 1]).toBe("required_met");
  });

  it("ranks an unrated required skill above any preferred work", () => {
    // Finding out costs one click and could be the largest gap on the board.
    expect(order.indexOf("required_unknown")).toBeLessThan(order.indexOf("preferred_unknown"));
  });
});

describe("the summary", () => {
  const skills = [
    skill("a", "required"),
    skill("b", "required"),
    skill("c", "preferred"),
    skill("d", "preferred"),
  ];
  const result = analyseGaps(skills, [
    rated("a", "advanced"),
    rated("b", "none"),
    rated("c", "beginner"),
  ]);

  it("counts each status once", () => {
    expect(result.summary).toMatchObject({
      total: 4,
      met: 2,
      missing: 1,
      unknown: 1,
      partial: 0,
    });
  });

  it("counts required skills not yet at target, including unrated ones", () => {
    expect(result.summary.requiredOutstanding).toBe(1);
  });
});

describe("provenance is never flattened", () => {
  it("keeps self-reported and assessment-derived levels apart", () => {
    const self = analyseGaps([skill("java", "required")], [rated("java", "beginner")]).gaps[0];
    const measured = analyseGaps(
      [skill("java", "required")],
      [rated("java", "beginner", "assessment")],
    ).gaps[0];

    expect(self.source).toBe("self_reported");
    expect(measured.source).toBe("assessment");
    expect(self.rationale).toContain("your own rating");
    expect(measured.rationale).toContain("practice results");
  });

  it("carries the skill's own provenance through from the description", () => {
    const result = analyseGaps([skill("javascript", "preferred", "inferred")], []);
    expect(result.gaps[0].skill.source).toBe("inferred");
    expect(result.caveats.join(" ")).toContain("inferred from the description");
  });
});

describe("what it refuses to claim", () => {
  const complete = analyseGaps(
    [skill("java", "required"), skill("sql", "required")],
    [rated("java", "advanced"), rated("sql", "advanced")],
  );

  it("never says the student is ready or will pass", () => {
    const text = [...complete.caveats, ...complete.gaps.map((g) => g.rationale)]
      .join(" ")
      .toLowerCase();
    for (const word of ["ready", "will pass", "guarantee", "prepared for the interview"]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("says the targets are its own suggestion, not the company's", () => {
    expect(complete.caveats.join(" ")).toContain("this tool's suggestion");
    expect(complete.caveats.join(" ")).toContain("not the company's stated requirement");
  });

  it("flags self-assessment as self-assessment", () => {
    expect(complete.caveats.join(" ")).toContain("your own assessment of yourself");
  });

  it("warns while anything is unrated", () => {
    const partial = analyseGaps([skill("java", "required"), skill("sql", "required")], [
      rated("java", "advanced"),
    ]);
    expect(partial.caveats.join(" ")).toContain("no rating yet");
  });
});

describe("edge cases", () => {
  it("handles a description with no skills", () => {
    const result = analyseGaps([], [rated("java", "advanced")]);
    expect(result.gaps).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  it("ignores rated skills the role does not ask for", () => {
    const result = analyseGaps([skill("java", "required")], [
      rated("java", "advanced"),
      rated("cobol", "advanced"),
    ]);
    expect(result.gaps).toHaveLength(1);
  });

  it("is stable for equal priorities", () => {
    const a = analyseGaps([skill("zeta", "required"), skill("alpha", "required")], []);
    expect(a.gaps.map((g) => g.skill.label)).toEqual(["ALPHA", "ZETA"]);
  });
});

/**
 * The four headline metrics.
 *
 * Each one is a number a student will read as a verdict on themselves, so the
 * definition matters more than the arithmetic. The rule throughout: a skill
 * the student has not rated has an undecided gap, not a zero one, and is
 * excluded — averaging unknowns as nought flatters the average exactly when
 * the student knows least about where they stand.
 */
describe("the summary metrics", () => {
  // Targets: required -> intermediate (rank 2), preferred -> beginner (rank 1).
  const skills = [
    skill("java", "required"),
    skill("sql", "required"),
    skill("dsa", "required"),
    skill("git", "preferred"),
    skill("docker", "preferred"),
  ];

  it("sums only shortfalls, and only on rated skills", () => {
    const result = analyseGaps(skills, [
      rated("java", "advanced"), // 2 - 3 = -1, a strength
      rated("sql", "none"), // 2 - 0 = 2
      rated("dsa", "beginner"), // 2 - 1 = 1
      rated("git", "beginner"), // 1 - 1 = 0, on target
      // docker unrated -> excluded
    ]);

    expect(result.summary.evaluated).toBe(4);
    // A skill held beyond its target does not cancel work the others need.
    expect(result.summary.totalGap).toBe(3);
    expect(result.summary.averageGap).toBe(0.8);
  });

  it("counts a critical gap only on a required skill two steps short", () => {
    const result = analyseGaps(skills, [
      rated("java", "none"), // required, 2 short -> critical
      rated("sql", "beginner"), // required, 1 short -> not critical
      rated("dsa", "intermediate"), // required, met
      rated("git", "none"), // preferred, 1 short -> never critical
      rated("docker", "none"), // preferred, 1 short -> never critical
    ]);
    expect(result.summary.criticalGaps).toBe(1);
  });

  it("counts a strength as meeting or exceeding the target", () => {
    const result = analyseGaps(skills, [
      rated("java", "intermediate"), // exactly at target
      rated("sql", "advanced"), // beyond target
      rated("dsa", "beginner"), // short
      rated("git", "advanced"), // beyond
      rated("docker", "none"), // short
    ]);
    expect(result.summary.strengths).toBe(3);
  });

  it("excludes unrated skills from every figure, and says how many", () => {
    const result = analyseGaps(skills, [rated("java", "none")]);
    expect(result.summary.unknown).toBe(4);
    expect(result.summary.evaluated).toBe(1);
    expect(result.summary.totalGap).toBe(2);
    expect(result.summary.averageGap).toBe(2);
  });

  it("reports zero rather than dividing by zero when nothing is rated", () => {
    const result = analyseGaps(skills, []);
    expect(result.summary.evaluated).toBe(0);
    expect(result.summary.totalGap).toBe(0);
    expect(result.summary.averageGap).toBe(0);
    expect(result.summary.criticalGaps).toBe(0);
    expect(result.summary.strengths).toBe(0);
  });

  it("keeps the average to one decimal, so it reads as a figure not a float", () => {
    const result = analyseGaps([skill("a", "required"), skill("b", "required"), skill("c", "required")], [
      rated("a", "none"),
      rated("b", "beginner"),
      rated("c", "intermediate"),
    ]);
    // (2 + 1 + 0) / 3 = 1
    expect(result.summary.averageGap).toBe(1);
  });

  it("never reports a negative total from a student who exceeds every target", () => {
    const result = analyseGaps(skills, skills.map((s) => rated(s.id, "advanced")));
    expect(result.summary.totalGap).toBe(0);
    expect(result.summary.averageGap).toBe(0);
    expect(result.summary.strengths).toBe(5);
  });
});
