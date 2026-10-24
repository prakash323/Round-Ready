import type { Criteria, Profile } from "./types";

/**
 * Eligibility evaluation (PRD rules R1–R6).
 *
 * The output is deliberately not a boolean. "Not eligible" is useless to a
 * student; "CGPA 7.40 is below the 7.50 cutoff, and 1 active backlog exceeds
 * the 0 allowed" tells them whether to argue with the TPO, clear a backlog, or
 * move on. So every criterion is evaluated independently and all failures are
 * returned.
 */

export type CriterionKey = "cgpa" | "backlogs" | "branch" | "tenth" | "twelfth" | "gapYears";

export type CriterionState = "pass" | "fail" | "unknown";

export interface CriterionResult {
  key: CriterionKey;
  label: string;
  state: CriterionState;
  /** The cutoff as written on the notice, formatted for display. */
  required: string;
  /** The student's value, or "not provided". */
  actual: string;
  /** A complete sentence a student can act on. */
  message: string;
}

export type EligibilityVerdict = "eligible" | "not_eligible" | "unknown";

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  /** Only the criteria the notice actually specified, in a stable order. */
  checks: CriterionResult[];
  failures: CriterionResult[];
  unknowns: CriterionResult[];
}

/** Evaluation order, fixed so the reasons list is stable across renders. */
const ORDER: CriterionKey[] = ["cgpa", "backlogs", "branch", "tenth", "twelfth", "gapYears"];

const LABELS: Record<CriterionKey, string> = {
  cgpa: "CGPA",
  backlogs: "Active backlogs",
  branch: "Branch",
  tenth: "10th percentage",
  twelfth: "12th percentage",
  gapYears: "Gap years",
};

function normaliseBranch(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Format a cutoff the way a notice writes it: `7.5`, not `7.50`; `60%`, not
 * `60.0%`. Trailing zeros are stripped only after a decimal point, so `10` does
 * not become `1`.
 *
 * `minDp` keeps a CGPA reading as a CGPA: a 7.0 cutoff should print as "7.0",
 * because "meets the 7 cutoff" reads like a typo on a notice that said 7.0.
 */
function fmt(n: number, dp = 2, minDp = 0): string {
  const stripped = n
    .toFixed(dp)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  if (minDp === 0) return stripped;
  const decimals = stripped.includes(".") ? stripped.split(".")[1].length : 0;
  return decimals >= minDp ? stripped : n.toFixed(minDp);
}

/** "1 active backlog" / "2 active backlogs". */
function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** A floor: the student's value must be greater than or equal to the cutoff. */
function atLeast(
  key: CriterionKey,
  cutoff: number,
  value: number | null,
  dp: number,
  unit: string,
  minDp = 0,
): CriterionResult {
  const label = LABELS[key];
  const required = `${fmt(cutoff, dp, minDp)}${unit}`;
  if (value === null) {
    return {
      key,
      label,
      state: "unknown",
      required,
      actual: "not provided",
      message: `${label} cutoff is ${required}, but your profile does not have it yet.`,
    };
  }
  const actual = `${fmt(value, dp, minDp)}${unit}`;
  // Inclusive by design (R3): a notice saying "7.5 and above" admits exactly 7.5.
  const pass = value >= cutoff;
  return {
    key,
    label,
    state: pass ? "pass" : "fail",
    required,
    actual,
    message: pass
      ? `${label} ${actual} meets the ${required} cutoff.`
      : `${label} ${actual} is below the ${required} cutoff.`,
  };
}

/** A ceiling: the student's value must be less than or equal to the limit. */
function atMost(
  key: CriterionKey,
  limit: number,
  value: number | null,
  noun: string,
): CriterionResult {
  const label = LABELS[key];
  const required = `${limit} allowed`;
  if (value === null) {
    return {
      key,
      label,
      state: "unknown",
      required,
      actual: "not provided",
      message: `This drive allows ${plural(limit, noun)}, but your profile does not say how many you have.`,
    };
  }
  const pass = value <= limit;
  const verb = value === 1 ? "is" : "are";
  return {
    key,
    label,
    state: pass ? "pass" : "fail",
    required,
    actual: String(value),
    message: pass
      ? `${plural(value, noun)} ${verb} within the ${limit} allowed.`
      : `${plural(value, noun)} ${value === 1 ? "exceeds" : "exceed"} the ${limit} allowed.`,
  };
}

function branchCheck(allowed: string[], branch: string): CriterionResult {
  const required = allowed.join(", ");
  const trimmed = branch.trim();
  if (trimmed === "") {
    return {
      key: "branch",
      label: LABELS.branch,
      state: "unknown",
      required,
      actual: "not provided",
      message: `This drive is open to ${required}, but your profile has no branch.`,
    };
  }
  const pass = allowed.some((b) => normaliseBranch(b) === normaliseBranch(trimmed));
  return {
    key: "branch",
    label: LABELS.branch,
    state: pass ? "pass" : "fail",
    required,
    actual: trimmed,
    message: pass
      ? `${trimmed} is an eligible branch.`
      : `This drive is open to ${required} only; your branch is ${trimmed}.`,
  };
}

/**
 * Evaluate one drive's criteria against one profile.
 *
 * Verdict precedence: a definite failure outranks a missing field. If the CGPA
 * cutoff is clearly not met, the student is not eligible whether or not their
 * 12th percentage is on file — telling them "unknown" there would be worse
 * information, not more careful information.
 */
export function evaluateEligibility(profile: Profile, criteria: Criteria): EligibilityResult {
  const byKey = new Map<CriterionKey, CriterionResult>();

  if (criteria.cgpaMin !== null) {
    byKey.set("cgpa", atLeast("cgpa", criteria.cgpaMin, profile.cgpa, 2, "", 1));
  }
  if (criteria.maxActiveBacklogs !== null) {
    byKey.set(
      "backlogs",
      atMost("backlogs", criteria.maxActiveBacklogs, profile.activeBacklogs, "active backlog"),
    );
  }
  // An empty list is "no branch restriction stated", so there is nothing to check.
  if (criteria.allowedBranches.length > 0) {
    byKey.set("branch", branchCheck(criteria.allowedBranches, profile.branch));
  }
  if (criteria.tenthPercentMin !== null) {
    byKey.set("tenth", atLeast("tenth", criteria.tenthPercentMin, profile.tenthPercent, 1, "%"));
  }
  if (criteria.twelfthPercentMin !== null) {
    byKey.set(
      "twelfth",
      atLeast("twelfth", criteria.twelfthPercentMin, profile.twelfthPercent, 1, "%"),
    );
  }
  if (criteria.gapYearsAllowed !== null) {
    byKey.set(
      "gapYears",
      atMost("gapYears", criteria.gapYearsAllowed, profile.gapYears, "gap year"),
    );
  }

  const checks = ORDER.map((k) => byKey.get(k)).filter((c): c is CriterionResult => Boolean(c));
  const failures = checks.filter((c) => c.state === "fail");
  const unknowns = checks.filter((c) => c.state === "unknown");

  const verdict: EligibilityVerdict =
    failures.length > 0 ? "not_eligible" : unknowns.length > 0 ? "unknown" : "eligible";

  return { verdict, checks, failures, unknowns };
}

/** One-line summary for a card. */
export function summariseEligibility(result: EligibilityResult): string {
  if (result.verdict === "eligible") {
    return result.checks.length === 0
      ? "No criteria stated — open to all"
      : `Meets all ${result.checks.length} stated criteria`;
  }
  if (result.verdict === "not_eligible") {
    return result.failures.map((f) => `${f.label} ${f.actual} vs ${f.required}`).join(" · ");
  }
  return `Needs ${result.unknowns.map((u) => u.label.toLowerCase()).join(" and ")} in your profile`;
}
