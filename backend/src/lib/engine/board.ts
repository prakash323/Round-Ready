import { clashesByDrive, counterpart, findClashes } from "./clash";
import { evaluateEligibility } from "./eligibility";
import { evaluatePolicyFor, resolvePolicyContext } from "./policy";
import { scoreDrive } from "./priority";
import { MS_PER_DAY, RESOLVED_STATUSES } from "./types";
import type { Clash, RoundRef } from "./clash";
import type { EligibilityResult } from "./eligibility";
import type { PolicyResult, SecuredGate } from "./policy";
import type { PriorityScore } from "./priority";
import type { Application, CompanyCategory, Drive, Profile } from "./types";

/**
 * The board: eligibility, policy and clashes composed into the single view the
 * student actually reads.
 *
 * Nothing here is persisted. The board is rebuilt from the profile, the drives
 * and the applications on every read, which is the central design decision of
 * the product: correcting a CGPA or accepting an offer re-evaluates every drive
 * at once. A stored `isEligible` flag would need a fan-out update that can
 * partially fail, and a stale "eligible" badge is precisely the failure this
 * tool exists to prevent.
 */

export type DriveStatus =
  | "actionable"
  | "unknown"
  | "not_eligible"
  | "blocked"
  | "expired"
  | "resolved";

export interface NextDate {
  kind: "deadline" | "round";
  at: Date;
  label: string;
  /**
   * The round has started and has not finished: it is happening right now.
   *
   * `at` is still its start, which is in the past, so a caller that only looks
   * at `at` would read this as "has passed". Nothing is more urgent than a
   * round the student is currently supposed to be sitting (AUDIT.md D6).
   */
  live: boolean;
}

export interface DriveView {
  drive: Drive;
  eligibility: EligibilityResult;
  policy: PolicyResult;
  application: Application | null;
  clashes: Clash[];
  nextDate: NextDate | null;
  deadlinePassed: boolean;
  status: DriveStatus;
  /** Only computed for drives you can still act on. */
  priority: PriorityScore | null;
}

export interface BoardInput {
  profile: Profile;
  drives: Drive[];
  applications: Application[];
  /**
   * The batch's secured-placement multipliers, as set by its CDC officer.
   *
   * Optional, defaulting to the standard 1.5× and 2×, so every existing caller
   * and test is unaffected — and so a batch whose officer has never opened the
   * policy page is gated by the same numbers as one whose officer has.
   */
  multipliers?: Record<CompanyCategory, number>;
}

export interface BoardStats {
  total: number;
  actionable: number;
  unknown: number;
  notEligible: number;
  blocked: number;
  expired: number;
  resolved: number;
  clashes: number;
  offers: number;
  bestAvailableCtcLpa: number | null;
  dueThisWeek: number;
}

export interface Board {
  views: DriveView[];
  actionable: DriveView[];
  unknown: DriveView[];
  notEligible: DriveView[];
  blocked: DriveView[];
  expired: DriveView[];
  resolved: DriveView[];
  clashes: Clash[];
  policyWarning: string | null;
  stats: BoardStats;
  /**
   * The secured-placement bar that was applied to every drive above.
   *
   * Exposed so that callers summarising the board — the dashboard headline,
   * the simulator — read the bar that was actually used rather than deriving
   * it a second time. A second derivation is a second place to forget the
   * batch's own multipliers, which is exactly what happened: the headline said
   * 1.5× while the verdicts beneath it used the officer's 1.75×, and both
   * looked authoritative.
   */
  securedGate: SecuredGate | null;
}

/**
 * The next thing that needs the student's attention for one drive.
 *
 * The application deadline only counts while the student has not applied — once
 * applied, the deadline is history and the next round is what matters.
 */
export function nextDateFor(
  drive: Drive,
  application: Application | null,
  now: Date,
): NextDate | null {
  const candidates: NextDate[] = [];
  const preApplication = application === null || application.status === "interested";

  if (
    preApplication &&
    drive.applicationDeadline !== null &&
    drive.applicationDeadline.getTime() > now.getTime()
  ) {
    candidates.push({
      kind: "deadline",
      at: drive.applicationDeadline,
      label: "Application deadline",
      live: false,
    });
  }
  for (const round of drive.rounds) {
    if (round.startAt.getTime() > now.getTime()) {
      candidates.push({ kind: "round", at: round.startAt, label: round.name, live: false });
    } else if (round.endAt.getTime() > now.getTime()) {
      // Started, not finished. Sorting by `at` puts it ahead of everything
      // upcoming, which is right: it is happening now.
      candidates.push({ kind: "round", at: round.startAt, label: round.name, live: true });
    }
  }
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  return candidates[0] ?? null;
}

function deriveStatus(
  eligibility: EligibilityResult,
  policy: PolicyResult,
  application: Application | null,
  deadlinePassed: boolean,
): DriveStatus {
  // A finished drive reports its outcome rather than a verdict — the drive that
  // produced your offer should not be labelled "blocked by your offer".
  if (application !== null && RESOLVED_STATUSES.includes(application.status)) return "resolved";
  if (eligibility.verdict === "not_eligible") return "not_eligible";
  // A drive you never applied to, whose deadline has gone, is not something you
  // can act on — however well it pays. Ranking it first would be the single
  // most embarrassing thing this board could do.
  if (deadlinePassed && (application === null || application.status === "interested")) {
    return "expired";
  }
  if (policy.state === "blocked") return "blocked";
  if (eligibility.verdict === "unknown") return "unknown";
  return "actionable";
}

export function buildBoard(input: BoardInput, now: Date = new Date()): Board {
  const { profile, drives, applications, multipliers } = input;
  const appByDrive = new Map(applications.map((a) => [a.driveId, a]));
  const driveById = new Map(drives.map((d) => [d.id, d]));

  // The gate is identical for every drive, so it is resolved once rather than
  // rebuilt inside the loop (AUDIT.md D7).
  const policyContext = resolvePolicyContext(profile, applications, drives, multipliers);

  // --- Pass 1: verdicts ------------------------------------------------------
  const verdicts = drives.map((drive) => {
    const application = appByDrive.get(drive.id) ?? null;
    const eligibility = evaluateEligibility(profile, drive.criteria);
    const policy = evaluatePolicyFor(profile, drive, policyContext);
    const deadlinePassed =
      drive.applicationDeadline !== null && drive.applicationDeadline.getTime() <= now.getTime();
    return {
      drive,
      application,
      eligibility,
      policy,
      nextDate: nextDateFor(drive, application, now),
      deadlinePassed,
      status: deriveStatus(eligibility, policy, application, deadlinePassed),
    };
  });

  // --- Clashes, over the drives the student could actually sit ---------------
  // A conflict only exists between two rounds you could both have attended. The
  // 10:00 assessment of a company whose CGPA cutoff you miss by a point is not
  // competing for your Tuesday morning, and reporting it as a clash would bury
  // the two conflicts that are real.
  const schedulable = verdicts
    .filter((v) => v.status === "actionable" || v.status === "unknown")
    .map((v) => v.drive);
  const clashes = findClashes(schedulable, applications);
  const clashIndex = clashesByDrive(clashes);

  const partial = verdicts.map((v) => ({ ...v, clashes: clashIndex.get(v.drive.id) ?? [] }));

  // --- Pass 2: ranking, which needs to know the best thing on the board ------
  // Priority is relative. "45 points of compensation" only means something
  // against the best drive this student can currently actually take.
  //
  // The set is every *rankable* drive — actionable and unknown both. Taking the
  // actionable group alone meant that with nothing actionable the denominator
  // fell back to each drive's own CTC, so a 3 LPA undecidable drive scored full
  // marks for pay. That is exactly the state a new student is in before their
  // profile is complete (AUDIT.md D5).
  const available = partial.filter((v) => v.status === "actionable" || v.status === "unknown");
  const bestAvailableCtcLpa =
    available.length > 0 ? Math.max(...available.map((v) => v.drive.ctcLpa)) : null;

  const views: DriveView[] = partial.map((v) => {
    const rankable = v.status === "actionable" || v.status === "unknown";
    if (!rankable) return { ...v, priority: null };

    const clashingCtcs = v.clashes
      .map((c) => counterpart(c, v.drive.id))
      .map((ref: RoundRef) => driveById.get(ref.driveId)?.ctcLpa)
      .filter((c): c is number => typeof c === "number");

    return {
      ...v,
      priority: scoreDrive({
        drive: v.drive,
        application: v.application,
        nextDate: v.nextDate?.at ?? null,
        nextDateIsLive: v.nextDate?.live ?? false,
        maxCtcLpa: bestAvailableCtcLpa ?? v.drive.ctcLpa,
        highestClashingCtcLpa: clashingCtcs.length > 0 ? Math.max(...clashingCtcs) : null,
        now,
      }),
    };
  });

  const byPriority = (a: DriveView, b: DriveView) =>
    (b.priority?.total ?? 0) - (a.priority?.total ?? 0);
  const byCtc = (a: DriveView, b: DriveView) => b.drive.ctcLpa - a.drive.ctcLpa;

  const offers = applications.filter((a) => a.status === "offer").length;
  const weekEnd = now.getTime() + 7 * MS_PER_DAY;

  return {
    views,
    actionable: views.filter((v) => v.status === "actionable").sort(byPriority),
    unknown: views.filter((v) => v.status === "unknown").sort(byPriority),
    notEligible: views.filter((v) => v.status === "not_eligible").sort(byCtc),
    blocked: views.filter((v) => v.status === "blocked").sort(byCtc),
    expired: views.filter((v) => v.status === "expired").sort(byCtc),
    resolved: views.filter((v) => v.status === "resolved").sort(byCtc),
    clashes,
    // The warning is a property of the application set, not of any one drive,
    // so every view carries the same value and the first is representative.
    policyWarning: views[0]?.policy.warning ?? null,
    // Taken from the context that produced the verdicts, so the summary and
    // the drives beneath it cannot disagree — and so it is still correct on a
    // board with no drives on it at all.
    securedGate: policyContext.secured,
    stats: {
      total: views.length,
      actionable: views.filter((v) => v.status === "actionable").length,
      unknown: views.filter((v) => v.status === "unknown").length,
      notEligible: views.filter((v) => v.status === "not_eligible").length,
      blocked: views.filter((v) => v.status === "blocked").length,
      expired: views.filter((v) => v.status === "expired").length,
      resolved: views.filter((v) => v.status === "resolved").length,
      clashes: clashes.length,
      offers,
      bestAvailableCtcLpa,
      dueThisWeek: views.filter(
        (v) =>
          (v.status === "actionable" || v.status === "unknown") &&
          v.nextDate !== null &&
          v.nextDate.at.getTime() <= weekEnd,
      ).length,
    },
  };
}

export interface AgendaItem {
  at: Date;
  kind: "deadline" | "round";
  label: string;
  company: string;
  driveId: string;
  ctcLpa: number;
  clashing: boolean;
}

/**
 * A flat, chronological agenda for the next `days` days, covering only drives
 * the student can still act on. This is the answer to "what can I not afford to
 * miss?", which is the question the board exists to answer.
 */
export function agenda(board: Board, days: number, now: Date = new Date()): AgendaItem[] {
  const horizon = now.getTime() + days * MS_PER_DAY;
  const items: AgendaItem[] = [];

  for (const view of [...board.actionable, ...board.unknown]) {
    const { drive, application, clashes } = view;
    // Keyed on the round's id, not its name. With two rounds called "Technical
    // Interview" the name-keyed set flagged both when only one overlapped
    // anything (AUDIT.md D3).
    const clashingRounds = new Set(
      clashes.flatMap((c) =>
        [c.a, c.b].filter((r) => r.driveId === drive.id).map((r) => r.roundId),
      ),
    );

    const preApplication = application === null || application.status === "interested";
    if (
      preApplication &&
      drive.applicationDeadline !== null &&
      inWindow(drive.applicationDeadline, now, horizon)
    ) {
      items.push({
        at: drive.applicationDeadline,
        kind: "deadline",
        label: "Application deadline",
        company: drive.company,
        driveId: drive.id,
        ctcLpa: drive.ctcLpa,
        clashing: false,
      });
    }

    for (const round of drive.rounds) {
      // A round in progress belongs on the agenda even though it started in the
      // past — it is the one thing the student cannot afford to be elsewhere
      // for. A round that has *finished* does not (AUDIT.md D6).
      const live = round.startAt.getTime() <= now.getTime() && round.endAt.getTime() > now.getTime();
      if (!live && !inWindow(round.startAt, now, horizon)) continue;
      items.push({
        at: round.startAt,
        kind: "round",
        label: round.name,
        company: drive.company,
        driveId: drive.id,
        ctcLpa: drive.ctcLpa,
        clashing: clashingRounds.has(round.id),
      });
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function inWindow(at: Date, now: Date, horizon: number): boolean {
  const t = at.getTime();
  return t > now.getTime() && t <= horizon;
}
