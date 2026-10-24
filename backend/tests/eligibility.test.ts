import { describe, expect, it } from "vitest";
import { evaluateEligibility, summariseEligibility } from "@/lib/engine";
import { makeCriteria, makeProfile } from "./fixtures";

/** PRD section 9, "Eligibility boundaries". */

describe("numeric cutoffs are inclusive", () => {
  it("admits a CGPA exactly equal to the cutoff", () => {
    const result = evaluateEligibility(
      makeProfile({ cgpa: 7.5 }),
      makeCriteria({ cgpaMin: 7.5 }),
    );
    expect(result.verdict).toBe("eligible");
  });

  it("rejects a CGPA one hundredth below the cutoff and names both numbers", () => {
    const result = evaluateEligibility(
      makeProfile({ cgpa: 7.49 }),
      makeCriteria({ cgpaMin: 7.5 }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].actual).toBe("7.49");
    expect(result.failures[0].required).toBe("7.5");
    expect(result.failures[0].message).toContain("below");
  });

  it("admits a 10th percentage exactly on the floor", () => {
    const result = evaluateEligibility(
      makeProfile({ tenthPercent: 60 }),
      makeCriteria({ tenthPercentMin: 60 }),
    );
    expect(result.verdict).toBe("eligible");
  });
});

describe("backlog ceilings", () => {
  it("admits zero backlogs against a zero-backlog rule", () => {
    const result = evaluateEligibility(
      makeProfile({ activeBacklogs: 0 }),
      makeCriteria({ maxActiveBacklogs: 0 }),
    );
    expect(result.verdict).toBe("eligible");
  });

  it("rejects one backlog against a zero-backlog rule", () => {
    const result = evaluateEligibility(
      makeProfile({ activeBacklogs: 1 }),
      makeCriteria({ maxActiveBacklogs: 0 }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures[0].key).toBe("backlogs");
  });

  it("admits two backlogs where two are allowed", () => {
    const result = evaluateEligibility(
      makeProfile({ activeBacklogs: 2 }),
      makeCriteria({ maxActiveBacklogs: 2 }),
    );
    expect(result.verdict).toBe("eligible");
  });
});

describe("unspecified criteria are not criteria", () => {
  it("treats a drive with no stated criteria as open to everyone", () => {
    const result = evaluateEligibility(makeProfile(), makeCriteria());
    expect(result.verdict).toBe("eligible");
    expect(result.checks).toHaveLength(0);
    expect(summariseEligibility(result)).toBe("No criteria stated — open to all");
  });

  it("does not evaluate a null cutoff even when the profile field is missing", () => {
    const result = evaluateEligibility(
      makeProfile({ twelfthPercent: null }),
      makeCriteria({ twelfthPercentMin: null }),
    );
    expect(result.verdict).toBe("eligible");
    expect(result.unknowns).toHaveLength(0);
  });

  it("distinguishes a zero cutoff, which is real, from no cutoff", () => {
    const stated = evaluateEligibility(
      makeProfile({ cgpa: null }),
      makeCriteria({ cgpaMin: 0 }),
    );
    const unstated = evaluateEligibility(
      makeProfile({ cgpa: null }),
      makeCriteria({ cgpaMin: null }),
    );
    expect(stated.verdict).toBe("unknown");
    expect(unstated.verdict).toBe("eligible");
  });
});

describe("branch matching", () => {
  it("treats an empty allowed-branches list as every branch", () => {
    const result = evaluateEligibility(
      makeProfile({ branch: "Civil" }),
      makeCriteria({ allowedBranches: [] }),
    );
    expect(result.verdict).toBe("eligible");
    expect(result.checks.some((c) => c.key === "branch")).toBe(false);
  });

  it("rejects a branch outside the list", () => {
    const result = evaluateEligibility(
      makeProfile({ branch: "ECE" }),
      makeCriteria({ allowedBranches: ["CSE", "IT"] }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures[0].message).toContain("CSE, IT");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    for (const branch of ["cse", "CSE", " Cse ", "cSe"]) {
      const result = evaluateEligibility(
        makeProfile({ branch }),
        makeCriteria({ allowedBranches: ["CSE"] }),
      );
      expect(result.verdict, `branch "${branch}"`).toBe("eligible");
    }
  });

  it("returns unknown when the profile has no branch at all", () => {
    const result = evaluateEligibility(
      makeProfile({ branch: "   " }),
      makeCriteria({ allowedBranches: ["CSE"] }),
    );
    expect(result.verdict).toBe("unknown");
  });
});

describe("missing profile data yields unknown, never a silent pass", () => {
  it("returns unknown for a stated cutoff the profile cannot answer", () => {
    const result = evaluateEligibility(
      makeProfile({ twelfthPercent: null }),
      makeCriteria({ twelfthPercentMin: 60 }),
    );
    expect(result.verdict).toBe("unknown");
    expect(result.unknowns[0].key).toBe("twelfth");
    expect(result.unknowns[0].actual).toBe("not provided");
    expect(result.failures).toHaveLength(0);
  });

  it("prompts for the specific missing field", () => {
    const result = evaluateEligibility(
      makeProfile({ twelfthPercent: null, tenthPercent: null }),
      makeCriteria({ twelfthPercentMin: 60, tenthPercentMin: 60 }),
    );
    expect(summariseEligibility(result)).toBe(
      "Needs 10th percentage and 12th percentage in your profile",
    );
  });

  it("lets a definite failure outrank a missing field", () => {
    // Not eligible is a fact here: the CGPA cutoff is clearly not met, so
    // reporting "unknown" because the 12th percentage is absent would be worse
    // information rather than more careful information.
    const result = evaluateEligibility(
      makeProfile({ cgpa: 6.0, twelfthPercent: null }),
      makeCriteria({ cgpaMin: 8.0, twelfthPercentMin: 60 }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures).toHaveLength(1);
    expect(result.unknowns).toHaveLength(1);
  });
});

describe("all failures are reported, in a stable order", () => {
  it("returns every failing criterion rather than the first", () => {
    const result = evaluateEligibility(
      makeProfile({ cgpa: 6.0, activeBacklogs: 2, branch: "ECE" }),
      makeCriteria({ cgpaMin: 7.5, maxActiveBacklogs: 0, allowedBranches: ["CSE"] }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures.map((f) => f.key)).toEqual(["cgpa", "backlogs", "branch"]);
  });

  it("orders checks the same way regardless of how criteria were written", () => {
    const result = evaluateEligibility(
      makeProfile(),
      makeCriteria({
        gapYearsAllowed: 1,
        twelfthPercentMin: 60,
        cgpaMin: 7.0,
        tenthPercentMin: 60,
        maxActiveBacklogs: 0,
        allowedBranches: ["CSE"],
      }),
    );
    expect(result.checks.map((c) => c.key)).toEqual([
      "cgpa",
      "backlogs",
      "branch",
      "tenth",
      "twelfth",
      "gapYears",
    ]);
  });

  it("summarises multiple failures as a single readable line", () => {
    const result = evaluateEligibility(
      makeProfile({ cgpa: 7.2, activeBacklogs: 1 }),
      makeCriteria({ cgpaMin: 7.5, maxActiveBacklogs: 0 }),
    );
    expect(summariseEligibility(result)).toBe(
      "CGPA 7.2 vs 7.5 · Active backlogs 1 vs 0 allowed",
    );
  });
});

describe("gap years", () => {
  it("admits a student within the allowance", () => {
    const result = evaluateEligibility(
      makeProfile({ gapYears: 1 }),
      makeCriteria({ gapYearsAllowed: 1 }),
    );
    expect(result.verdict).toBe("eligible");
  });

  it("rejects a student over the allowance", () => {
    const result = evaluateEligibility(
      makeProfile({ gapYears: 2 }),
      makeCriteria({ gapYearsAllowed: 1 }),
    );
    expect(result.verdict).toBe("not_eligible");
    expect(result.failures[0].key).toBe("gapYears");
  });
});
