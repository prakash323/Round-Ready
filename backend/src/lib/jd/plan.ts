import { MS_PER_DAY } from "../engine/types";
import { PROFICIENCY_LABEL } from "./gap";
import type { SkillGap } from "./gap";
import type { SkillImportance } from "./analyze";

/**
 * The study plan.
 *
 * Derived, never stored — the same decision the placement board is built on.
 * Only three things persist: hours per day, the deadline, and which task ids
 * the student has ticked. Everything else is recomputed on every read.
 *
 * That is what makes "do not silently discard completed work when the plan
 * regenerates" true by construction rather than by care: there is no
 * regeneration step. Rate a skill, move the deadline, lose an evening — the
 * schedule reshapes, and the ticks survive because they were never part of the
 * thing being rebuilt.
 *
 * It follows that task ids must be stable across rebuilds. They are derived
 * from the skill and the block number, so the third Java block is
 * `java#2` today and `java#2` tomorrow.
 */

/** A realistic sitting. Longer blocks look efficient on paper and are not. */
export const SESSION_HOURS = 2;

/**
 * Hours per level of gap, by importance.
 *
 * An estimate, and labelled as one everywhere it surfaces. Nobody can say how
 * long a given student needs on hashing; what this can honestly do is be
 * consistent, and spend more on a required gap than a preferred one.
 */
export const HOURS_PER_LEVEL: Record<SkillImportance, number> = {
  required: 3,
  preferred: 2,
};

/**
 * What an unrated skill gets.
 *
 * Not a study block — you cannot plan study for something you have not
 * assessed, and guessing would mean scheduling hours against a gap that may
 * not exist. So it gets a short, honest first step: find out where you stand.
 */
export const ASSESS_HOURS = 0.5;

/** With no deadline there is still a horizon, or the plan runs forever. */
export const DEFAULT_HORIZON_DAYS = 14;

export type TaskKind = "study" | "assess";

export interface PlanTask {
  /** Stable across rebuilds. Completion is recorded against this. */
  id: string;
  skillId: string;
  label: string;
  kind: TaskKind;
  importance: SkillImportance;
  objective: string;
  hours: number;
  /** Days from the start date. */
  dayOffset: number;
  date: Date;
  done: boolean;
}

export interface PlanDay {
  dayOffset: number;
  date: Date;
  tasks: PlanTask[];
  hours: number;
}

export interface UncoveredSkill {
  skillId: string;
  label: string;
  importance: SkillImportance;
  hoursShort: number;
  reason: string;
}

export interface PlanSummary {
  totalHours: number;
  doneHours: number;
  totalTasks: number;
  doneTasks: number;
  daysAvailable: number;
  hoursAvailable: number;
  /** Required skills that did not fit before the deadline. */
  requiredUncovered: number;
}

export interface StudyPlan {
  days: PlanDay[];
  uncovered: UncoveredSkill[];
  summary: PlanSummary;
  notes: string[];
}

export interface PlanSettings {
  hoursPerDay: number;
  deadline: Date | null;
  completedTaskIds: string[];
}

export interface PlanInput {
  gaps: SkillGap[];
  settings: PlanSettings;
  /** Injected, never read from ambient scope. */
  startOn: Date;
}

/** Midnight-anchored day offset, so a plan built at 23:50 does not lose a day. */
function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime() + days * MS_PER_DAY);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface Work {
  gap: SkillGap;
  kind: TaskKind;
  hours: number;
  objective: string;
}

/**
 * How much work each gap represents.
 *
 * Gaps arrive already ordered by the gap analysis — required before preferred,
 * widest first inside each band — and that order is preserved rather than
 * recomputed here. Scheduling must not quietly disagree with the list the
 * student just read.
 */
function workFor(gap: SkillGap): Work | null {
  if (gap.status === "met") return null;

  if (gap.status === "unknown") {
    return {
      gap,
      kind: "assess",
      hours: ASSESS_HOURS,
      objective: `Work out where you stand on ${gap.skill.label}, then rate it. Until then its gap is undecided, so nothing can be scheduled against it.`,
    };
  }

  const steps = Math.max(1, gap.distance);
  const from = gap.level === null ? "scratch" : PROFICIENCY_LABEL[gap.level].toLowerCase();
  return {
    gap,
    kind: "study",
    hours: steps * HOURS_PER_LEVEL[gap.skill.importance],
    objective:
      gap.status === "missing"
        ? `Start ${gap.skill.label} from ${from} and reach ${PROFICIENCY_LABEL[gap.target].toLowerCase()}.`
        : `Move ${gap.skill.label} from ${from} to ${PROFICIENCY_LABEL[gap.target].toLowerCase()}.`,
  };
}

export function buildPlan(input: PlanInput): StudyPlan {
  const { gaps, settings, startOn } = input;
  const hoursPerDay = Math.max(0.5, settings.hoursPerDay);
  const completed = new Set(settings.completedTaskIds);

  const daysAvailable =
    settings.deadline === null
      ? DEFAULT_HORIZON_DAYS
      : // Today counts, so a deadline tomorrow leaves two days.
        Math.max(0, daysBetween(startOn, settings.deadline) + 1);

  const capacity = Array.from({ length: daysAvailable }, () => hoursPerDay);
  const days: PlanDay[] = Array.from({ length: daysAvailable }, (_, i) => ({
    dayOffset: i,
    date: addDays(startOn, i),
    tasks: [],
    hours: 0,
  }));

  const uncovered: UncoveredSkill[] = [];
  let totalHours = 0;
  let doneHours = 0;
  let totalTasks = 0;
  let doneTasks = 0;

  for (const gap of gaps) {
    const work = workFor(gap);
    if (!work) continue;

    // Split into sittings before placing, so one large skill does not consume
    // a whole day that two smaller required ones needed to share.
    const blocks: number[] = [];
    let remaining = work.hours;
    while (remaining > 0.001) {
      const block = Math.min(SESSION_HOURS, remaining, hoursPerDay);
      blocks.push(round1(block));
      remaining = round1(remaining - block);
    }

    let placedHours = 0;
    blocks.forEach((hours, index) => {
      const id = `${gap.skill.id}#${index}`;
      const done = completed.has(id);

      // A ticked task is already spent: it keeps its place in the schedule but
      // does not compete for capacity it has finished using.
      const dayIndex = done
        ? Math.min(index, Math.max(0, daysAvailable - 1))
        : capacity.findIndex((free) => free >= hours - 0.001);

      if (dayIndex === -1 || daysAvailable === 0) return;

      const task: PlanTask = {
        id,
        skillId: gap.skill.id,
        label: gap.skill.label,
        kind: work.kind,
        importance: gap.skill.importance,
        objective: work.objective,
        hours,
        dayOffset: dayIndex,
        date: days[dayIndex].date,
        done,
      };
      days[dayIndex].tasks.push(task);
      days[dayIndex].hours = round1(days[dayIndex].hours + hours);
      if (!done) capacity[dayIndex] = round1(capacity[dayIndex] - hours);

      placedHours = round1(placedHours + hours);
      totalHours = round1(totalHours + hours);
      totalTasks += 1;
      if (done) {
        doneHours = round1(doneHours + hours);
        doneTasks += 1;
      }
    });

    // What did not fit, said plainly rather than crammed into the last day.
    const short = round1(work.hours - placedHours);
    if (short > 0.001) {
      uncovered.push({
        skillId: gap.skill.id,
        label: gap.skill.label,
        importance: gap.skill.importance,
        hoursShort: short,
        reason:
          daysAvailable === 0
            ? "The deadline has passed."
            : `There is no room left before the deadline for ${short} more hour${short === 1 ? "" : "s"}.`,
      });
    }
  }

  const hoursAvailable = round1(daysAvailable * hoursPerDay);
  const requiredUncovered = uncovered.filter((u) => u.importance === "required").length;

  const notes: string[] = [];
  if (daysAvailable === 0) {
    notes.push("The deadline has already passed, so nothing could be scheduled.");
  }
  if (uncovered.length > 0) {
    notes.push(
      `${uncovered.length} skill${uncovered.length === 1 ? "" : "s"} did not fit in the time available. They are listed below rather than squeezed into the last day — a plan you cannot finish is worse than one that tells you what it left out.`,
    );
  }
  if (requiredUncovered > 0) {
    notes.push(
      `${requiredUncovered} of those ${requiredUncovered === 1 ? "is" : "are"} required for the role. More hours a day, or an earlier start, is the only thing that changes that.`,
    );
  }
  if (gaps.some((g) => g.status === "unknown")) {
    notes.push(
      "Unrated skills get a short slot to work out where you stand, not a study block — there is no way to size work for a gap nobody has measured.",
    );
  }
  notes.push(
    "Durations are rough estimates, not a syllabus. Nobody can say how long you personally need on a topic; what this does is spend more time on a required gap than a preferred one, consistently.",
  );

  return {
    days: days.filter((d) => d.tasks.length > 0),
    uncovered,
    summary: {
      totalHours,
      doneHours,
      totalTasks,
      doneTasks,
      daysAvailable,
      hoursAvailable,
      requiredUncovered,
    },
    notes,
  };
}
