import { MS_PER_DAY } from "./types";
import type { Application, Drive } from "./types";

/**
 * Explainable priority ranking.
 *
 * A single opaque number would be worse than no number at all — a student
 * cannot act on "87". So the score is returned with its components, and the UI
 * shows the arithmetic: this drive ranks above that one because it pays more,
 * closes sooner, and you are already two rounds in.
 *
 * The weights are a product judgement, not a discovered truth, and they are
 * exported so they can be asserted in tests and displayed to the reader.
 */

export const WEIGHTS = {
  /** Compensation, relative to the best drive currently available to you. */
  ctc: 45,
  /** How soon the next thing happens. */
  urgency: 35,
  /** How far through the funnel you already are — sunk effort is real effort. */
  stage: 20,
  /** Deducted when this drive's rounds collide with another live drive. */
  clash: -15,
} as const;

/** Beyond this horizon, a deadline contributes nothing to urgency. */
export const URGENCY_HORIZON_DAYS = 21;

const STAGE_POINTS: Record<string, number> = {
  interested: 4,
  applied: 10,
  in_progress: 20,
};

export interface PriorityComponent {
  label: string;
  points: number;
  detail: string;
}

export interface PriorityScore {
  total: number;
  components: PriorityComponent[];
}

export interface PriorityInput {
  drive: Drive;
  application: Application | null;
  /** The next deadline or round start for this drive, if any. */
  nextDate: Date | null;
  /** That next date is a round already under way — its start is in the past,
   *  but it is the most urgent thing on the board (AUDIT.md D6). */
  nextDateIsLive?: boolean;
  /** Highest CTC among the drives currently available to this student. */
  maxCtcLpa: number;
  /** Highest CTC among drives whose rounds clash with this one, if any. */
  highestClashingCtcLpa: number | null;
  now: Date;
}

export function daysUntil(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

export function scoreDrive(input: PriorityInput): PriorityScore {
  const { drive, application, nextDate, maxCtcLpa, highestClashingCtcLpa, now } = input;
  const nextDateIsLive = input.nextDateIsLive ?? false;
  const components: PriorityComponent[] = [];

  // --- Compensation, normalised against the best thing on your board ---------
  const ctcRatio = maxCtcLpa > 0 ? Math.min(1, drive.ctcLpa / maxCtcLpa) : 0;
  components.push({
    label: "Compensation",
    points: round1(WEIGHTS.ctc * ctcRatio),
    detail:
      maxCtcLpa > 0
        ? `${drive.ctcLpa} LPA against the best available ${maxCtcLpa} LPA`
        : "no comparable drives",
  });

  // --- Urgency ---------------------------------------------------------------
  let urgency = 0;
  let urgencyDetail = "nothing scheduled yet";
  if (nextDateIsLive) {
    // Nothing can be more urgent than a round the student is supposed to be
    // sitting at this moment, so it takes the whole weight rather than being
    // read as a date that has passed.
    urgency = WEIGHTS.urgency;
    urgencyDetail = "in progress right now";
  } else if (nextDate !== null) {
    const days = daysUntil(now, nextDate);
    if (days < 0) {
      urgencyDetail = "next date has passed";
    } else {
      urgency = WEIGHTS.urgency * Math.max(0, 1 - days / URGENCY_HORIZON_DAYS);
      const whole = Math.floor(days);
      urgencyDetail =
        whole === 0 ? "due within 24 hours" : `${whole} day${whole === 1 ? "" : "s"} away`;
    }
  }
  components.push({ label: "Urgency", points: round1(urgency), detail: urgencyDetail });

  // --- Progress already made -------------------------------------------------
  const stage = application ? (STAGE_POINTS[application.status] ?? 0) : 0;
  components.push({
    label: "Progress",
    points: stage,
    detail: application ? statusLabel(application.status) : "not applied yet",
  });

  // --- Clash penalty ---------------------------------------------------------
  let clash = 0;
  let clashDetail = "no scheduling conflict";
  if (highestClashingCtcLpa !== null) {
    // A conflict with something better paid is a harder problem than a conflict
    // with something worse paid, so it costs more.
    const severe = highestClashingCtcLpa > drive.ctcLpa;
    clash = severe ? WEIGHTS.clash : WEIGHTS.clash / 2;
    clashDetail = severe
      ? `clashes with a better-paid ${highestClashingCtcLpa} LPA drive`
      : highestClashingCtcLpa === drive.ctcLpa
        ? `clashes with another ${highestClashingCtcLpa} LPA drive`
        : `clashes with a lower-paid ${highestClashingCtcLpa} LPA drive`;
  }
  components.push({ label: "Conflict", points: round1(clash), detail: clashDetail });

  const total = round1(
    Math.max(0, components.reduce((sum, c) => sum + c.points, 0)),
  );
  return { total, components };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "interested":
      return "Interested";
    case "applied":
      return "Applied";
    case "in_progress":
      return "In progress";
    case "offer":
      return "Offer received";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    default:
      return status;
  }
}
