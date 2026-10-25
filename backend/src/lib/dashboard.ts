/**
 * What the student should do next.
 *
 * Pure: it takes what is already known and ranks it. No database, no clock
 * from ambient scope — `now` is passed in, like everywhere else in this
 * codebase, so the ordering is testable at any date.
 *
 * Every item here is derived from something real and carries the reason it
 * was surfaced. A dashboard that says "prepare for Zoho" without saying why
 * is a dashboard the student learns to scroll past; one that says "deadline
 * in 14 hours and you have not applied" is one they act on.
 *
 * Nothing is invented to fill the list. An empty list means there is nothing
 * pressing, and saying so is more useful than manufacturing a task.
 */

export type PriorityKind =
  | "drive_deadline"
  | "study_task"
  | "skill_gap"
  | "profile_incomplete"
  | "assessment_weak";

export interface PriorityItem {
  kind: PriorityKind;
  title: string;
  /** Why this is on the list, in the student's terms. */
  detail: string;
  /** How urgent, for the chip: red, amber or neutral. */
  urgency: "critical" | "soon" | "normal";
  /** Where acting on it takes them. */
  href: string;
  /** Lower sorts first. */
  rank: number;
  /** Shown on the chip — "Due today", "Tomorrow", "in 3 days". */
  when: string | null;
}

export interface DashboardInput {
  now: Date;
  profileIsUsable: boolean;
  /** Drives the student can act on, with their deadline if any. */
  openDrives: {
    id: string;
    company: string;
    role: string;
    applicationDeadline: Date | null;
    hasApplied: boolean;
  }[];
  /** Today's study tasks. */
  todayTasks: { id: string; title: string; done: boolean; durationMinutes: number }[];
  /** Overdue: scheduled before today and still not done. */
  overdueTaskCount: number;
  /** The worst outstanding gaps, already ranked by the gap engine. */
  criticalGaps: { skillId: string; label: string; jobDescriptionId: string }[];
  /** Recent assessment scores, worst first. */
  weakAssessments: { skillId: string; label: string; scorePercent: number }[];
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** "Due today", "Tomorrow", "in 3 days", or null when there is no deadline. */
export function describeWhen(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return "Closed";
  if (ms < 24 * HOUR) {
    const hours = Math.max(1, Math.round(ms / HOUR));
    return hours <= 1 ? "Within the hour" : `in ${hours} hours`;
  }
  const days = Math.round(ms / DAY);
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

/**
 * Build the list, ranked.
 *
 * The ranking is deliberately crude and explicable rather than a weighted
 * score nobody can audit: a deadline inside two days beats everything,
 * because it is the only item on this list that expires.
 */
export function priorityItems(input: DashboardInput, limit = 6): PriorityItem[] {
  const { now } = input;
  const items: PriorityItem[] = [];

  // A profile without CGPA, backlogs and branch makes every verdict on the
  // board "cannot determine", so nothing else on the dashboard means much.
  if (!input.profileIsUsable) {
    items.push({
      kind: "profile_incomplete",
      title: "Finish your profile",
      detail:
        "Eligibility is computed from your CGPA, active backlogs and branch. Without them every drive reads as “cannot determine”.",
      urgency: "critical",
      href: "/profile",
      rank: 0,
      when: null,
    });
  }

  for (const drive of input.openDrives) {
    if (drive.applicationDeadline === null) continue;
    const ms = drive.applicationDeadline.getTime() - now.getTime();
    if (ms <= 0) continue;
    // Beyond a week it is not yet a thing to do today.
    if (ms > 7 * DAY) continue;
    // Already applied: the deadline has stopped being the student's problem.
    if (drive.hasApplied) continue;

    const urgency = ms < 2 * DAY ? "critical" : ms < 4 * DAY ? "soon" : "normal";
    items.push({
      kind: "drive_deadline",
      title: `Apply to ${drive.company}`,
      detail: `${drive.role} — registration closes and you have not applied yet.`,
      urgency,
      href: `/drives/${drive.id}`,
      // Sorted by how soon it closes, so the tightest deadline leads.
      rank: 10 + ms / DAY,
      when: describeWhen(drive.applicationDeadline, now),
    });
  }

  const outstanding = input.todayTasks.filter((t) => !t.done);
  if (outstanding.length > 0) {
    const minutes = outstanding.reduce((sum, t) => sum + t.durationMinutes, 0);
    items.push({
      kind: "study_task",
      title: `${outstanding.length} study task${outstanding.length === 1 ? "" : "s"} today`,
      detail:
        minutes >= 60
          ? `About ${Math.round((minutes / 60) * 10) / 10} hours planned for today.`
          : `About ${minutes} minutes planned for today.`,
      urgency: "soon",
      href: "/planner",
      rank: 20,
      when: "Today",
    });
  }

  if (input.overdueTaskCount > 0) {
    items.push({
      kind: "study_task",
      title: `${input.overdueTaskCount} task${input.overdueTaskCount === 1 ? "" : "s"} slipped`,
      detail:
        "Scheduled before today and still open. Reschedule them rather than letting them pile up.",
      urgency: "soon",
      href: "/planner",
      rank: 21,
      when: "Overdue",
    });
  }

  for (const [index, gap] of input.criticalGaps.slice(0, 2).entries()) {
    items.push({
      kind: "skill_gap",
      title: `Close the gap on ${gap.label}`,
      detail: "A required skill for a role you saved, and you are two or more levels short.",
      urgency: "normal",
      href: `/skills-gap?jd=${gap.jobDescriptionId}`,
      rank: 30 + index,
      when: null,
    });
  }

  for (const [index, weak] of input.weakAssessments.slice(0, 1).entries()) {
    items.push({
      kind: "assessment_weak",
      title: `Revise ${weak.label}`,
      detail: `You scored ${weak.scorePercent}% on the last practice assessment for this topic.`,
      urgency: "normal",
      href: "/practice",
      rank: 40 + index,
      when: null,
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

// --- The CDC officer's view -------------------------------------------------

/**
 * A published drive has problems an officer can fix.
 *
 * This is the officer's equivalent of the student's priority list: not "what
 * should I study" but "what did I publish badly". Each flag is something only
 * the officer can correct, and each is derived from the drive itself rather
 * than from any student's data — an officer has no business reading an
 * individual student's board to find out their notice is incomplete.
 */
export type DriveIssue = "no_deadline" | "no_rounds" | "deadline_passed" | "no_criteria";

export interface DriveHealth {
  driveId: string;
  company: string;
  role: string;
  issues: DriveIssue[];
}

export interface OfficerDriveInput {
  id: string;
  company: string;
  role: string;
  applicationDeadline: Date | null;
  roundCount: number;
  /** True when the notice stated at least one eligibility criterion. */
  hasCriteria: boolean;
}

export const DRIVE_ISSUE_TEXT: Record<DriveIssue, string> = {
  no_deadline:
    "No registration deadline, so it never appears in anyone's next seven days and never expires.",
  no_rounds: "No rounds scheduled, so it contributes nothing to any student's calendar.",
  deadline_passed: "The deadline has passed. Withdraw it if the drive is over.",
  no_criteria:
    "No eligibility criteria stated, so every student sees “cannot determine” rather than a verdict.",
};

/**
 * Which published drives are incomplete, worst first.
 *
 * Deliberately reports only what is checkable from the notice. A drive with
 * no criteria may genuinely be open to everyone — so it is flagged as worth
 * checking, not as wrong.
 */
export function driveHealth(drives: OfficerDriveInput[], now: Date): DriveHealth[] {
  const out: DriveHealth[] = [];

  for (const drive of drives) {
    const issues: DriveIssue[] = [];

    if (drive.applicationDeadline === null) issues.push("no_deadline");
    else if (drive.applicationDeadline.getTime() <= now.getTime()) issues.push("deadline_passed");

    if (drive.roundCount === 0) issues.push("no_rounds");
    if (!drive.hasCriteria) issues.push("no_criteria");

    if (issues.length > 0) {
      out.push({ driveId: drive.id, company: drive.company, role: drive.role, issues });
    }
  }

  // Most problems first; a drive with three gaps needs attention before one
  // with a single missing field.
  return out.sort((a, b) => b.issues.length - a.issues.length);
}
