import type { ExtractedSkill, SkillImportance } from "./analyze";

/**
 * Skill-gap analysis: what the role asks for, against what the student says
 * they have.
 *
 * Pure, like everything else in this folder. The one rule that shapes the
 * whole module: **an unrated skill is unknown, never zero.** A student who has
 * not told us about Kubernetes has an undecided gap, not a missing skill, and
 * reporting it as missing would send them to study something they may already
 * know — the same mistake the eligibility engine refuses to make with a blank
 * 12th percentage.
 *
 * Nothing here claims readiness. Clearing every gap means the student has
 * covered what the description asked for, which is not the same as passing an
 * interview, and the wording never pretends otherwise.
 */

export type Proficiency = "none" | "beginner" | "intermediate" | "advanced";

/** Ascending. Index is the comparable rank. */
export const PROFICIENCY_ORDER: Proficiency[] = ["none", "beginner", "intermediate", "advanced"];

export const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  none: "Not started",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function rankOf(level: Proficiency): number {
  return PROFICIENCY_ORDER.indexOf(level);
}

/**
 * Where a proficiency figure came from.
 *
 * Only `self_reported` exists today. `assessment` is declared because the
 * distinction has to survive into the UI the moment practice results exist —
 * a number the student typed about themselves and a number earned against
 * questions are not the same kind of evidence, and merging them later would
 * mean silently upgrading every guess into a measurement.
 */
export type ProficiencySource = "self_reported" | "assessment";

export interface StudentSkill {
  skillId: string;
  level: Proficiency;
  source: ProficiencySource;
}

export type GapStatus = "met" | "partial" | "missing" | "unknown";

/**
 * The level this tool suggests aiming for, by importance.
 *
 * A convention, not a company requirement — no job description states the
 * proficiency it wants on a four-point scale, and pretending otherwise would
 * be inventing hiring criteria. Exported so it is configurable, and the UI
 * labels it as a recommendation.
 */
export const DEFAULT_TARGETS: Record<SkillImportance, Proficiency> = {
  required: "intermediate",
  preferred: "beginner",
};

export interface SkillGap {
  skill: ExtractedSkill;
  /** `null` when the student has never rated it. Never defaulted to "none". */
  level: Proficiency | null;
  source: ProficiencySource | null;
  target: Proficiency;
  status: GapStatus;
  /** Levels below target. 0 when met, and 0 when unknown — not a measurement. */
  distance: number;
  /** Sort key only. The rationale is what a student should read. */
  priority: number;
  rationale: string;
}

/**
 * A gap of this many proficiency steps on a REQUIRED skill is "critical".
 *
 * Two steps is the distance from "not started" to "intermediate", or from
 * "beginner" to "advanced" — a gap that cannot plausibly be closed in a few
 * evenings. Exported so the rule is one number in one place rather than a
 * threshold repeated in the UI, and so a college that disagrees can change it.
 */
export const CRITICAL_GAP_STEPS = 2;

export interface GapSummary {
  total: number;
  met: number;
  partial: number;
  missing: number;
  unknown: number;
  /** Required skills not yet at target, the number that actually matters. */
  requiredOutstanding: number;

  /**
   * How many skills carry a usable number.
   *
   * An unrated skill has no current level, so its gap is undecided rather than
   * zero. Those are excluded from every figure below and counted here instead,
   * because averaging an unknown as nought flatters the average exactly when
   * the student knows least about themselves.
   */
  evaluated: number;

  /**
   * The sum of positive gaps across evaluated skills, in proficiency steps.
   *
   * Only shortfalls are summed. A skill the student has beyond its target
   * does not subtract from the work the other skills still need — "three
   * steps behind on DSA" is not cancelled by "one step ahead on Git".
   */
  totalGap: number;

  /** `totalGap / evaluated`, to one decimal. 0 when nothing is evaluated. */
  averageGap: number;

  /** Required skills whose gap is at least `CRITICAL_GAP_STEPS`. */
  criticalGaps: number;

  /** Evaluated skills at or above their target. */
  strengths: number;
}

export interface GapAnalysis {
  gaps: SkillGap[];
  summary: GapSummary;
  /** Plain-language notes about what this analysis can and cannot tell them. */
  caveats: string[];
}

/**
 * Priority bands, widest gap first within each.
 *
 * Required always outranks preferred: a preferred skill the student has never
 * touched must not be pushed above a required one they are halfway through,
 * however large the second number looks. Unknown-required sits above
 * missing-preferred because finding out costs one click and could be the
 * biggest gap on the list.
 */
function bandOf(importance: SkillImportance, status: GapStatus): number {
  if (importance === "required") {
    if (status === "missing") return 0;
    if (status === "partial") return 1;
    if (status === "unknown") return 2;
    return 6; // met
  }
  if (status === "missing") return 3;
  if (status === "partial") return 4;
  if (status === "unknown") return 5;
  return 7; // met
}

function rationaleFor(
  skill: ExtractedSkill,
  status: GapStatus,
  level: Proficiency | null,
  target: Proficiency,
  source: ProficiencySource | null,
): string {
  const importance = skill.importance === "required" ? "Required" : "Preferred";
  const basis = source === "assessment" ? "from your practice results" : "by your own rating";

  if (status === "unknown") {
    return `${importance} for this role. You have not rated ${skill.label} yet, so the gap is undecided rather than zero.`;
  }
  if (status === "met") {
    return `${importance}, and you are at ${PROFICIENCY_LABEL[level!].toLowerCase()} ${basis} — at or above the suggested ${PROFICIENCY_LABEL[target].toLowerCase()}.`;
  }
  const word = status === "missing" ? "have not started" : `are at ${PROFICIENCY_LABEL[level!].toLowerCase()}`;
  return `${importance}, and you ${word} ${basis}. Suggested target for a ${skill.importance} skill is ${PROFICIENCY_LABEL[target].toLowerCase()}.`;
}

export interface GapOptions {
  targets?: Record<SkillImportance, Proficiency>;
}

export function analyseGaps(
  skills: ExtractedSkill[],
  studentSkills: StudentSkill[],
  options: GapOptions = {},
): GapAnalysis {
  const targets = options.targets ?? DEFAULT_TARGETS;
  const byId = new Map(studentSkills.map((s) => [s.skillId, s]));

  const gaps: SkillGap[] = skills.map((skill) => {
    const rated = byId.get(skill.id) ?? null;
    const target = targets[skill.importance];
    const level = rated?.level ?? null;

    let status: GapStatus;
    let distance = 0;
    if (level === null) {
      status = "unknown";
    } else if (rankOf(level) >= rankOf(target)) {
      status = "met";
    } else if (level === "none") {
      status = "missing";
      distance = rankOf(target);
    } else {
      status = "partial";
      distance = rankOf(target) - rankOf(level);
    }

    const band = bandOf(skill.importance, status);
    return {
      skill,
      level,
      source: rated?.source ?? null,
      target,
      status,
      distance,
      // Band dominates; distance only orders within a band.
      priority: band * 100 - distance,
      rationale: rationaleFor(skill, status, level, target, rated?.source ?? null),
    };
  });

  gaps.sort((a, b) => a.priority - b.priority || a.skill.label.localeCompare(b.skill.label));

  const count = (status: GapStatus) => gaps.filter((g) => g.status === status).length;

  // Only skills the student has actually rated carry a usable number. The
  // rest are reported as unknown rather than folded in as zero.
  const evaluatedGaps = gaps.filter((g) => g.status !== "unknown");
  const totalGap = evaluatedGaps.reduce((sum, g) => sum + Math.max(0, g.distance), 0);

  const summary: GapSummary = {
    total: gaps.length,
    met: count("met"),
    partial: count("partial"),
    missing: count("missing"),
    unknown: count("unknown"),
    requiredOutstanding: gaps.filter(
      (g) => g.skill.importance === "required" && g.status !== "met",
    ).length,
    evaluated: evaluatedGaps.length,
    totalGap,
    averageGap:
      evaluatedGaps.length === 0 ? 0 : Math.round((totalGap / evaluatedGaps.length) * 10) / 10,
    criticalGaps: evaluatedGaps.filter(
      (g) => g.skill.importance === "required" && g.distance >= CRITICAL_GAP_STEPS,
    ).length,
    strengths: evaluatedGaps.filter((g) => g.distance <= 0).length,
  };

  const caveats: string[] = [];
  if (summary.unknown > 0) {
    caveats.push(
      `${summary.unknown} skill${summary.unknown === 1 ? " has" : "s have"} no rating yet, so ${summary.unknown === 1 ? "its gap is" : "those gaps are"} undecided rather than zero. Rate them to see where you stand.`,
    );
  }
  if (gaps.some((g) => g.source === "self_reported")) {
    caveats.push(
      "Proficiency here is your own assessment of yourself, not a measurement.",
    );
  }
  if (gaps.some((g) => g.skill.source === "inferred")) {
    caveats.push(
      "Some of these skills were inferred from the description rather than named in it.",
    );
  }
  caveats.push(
    "Target levels are this tool's suggestion, not the company's stated requirement — no job description names the proficiency it wants on a four-point scale.",
  );

  return { gaps, summary, caveats };
}
