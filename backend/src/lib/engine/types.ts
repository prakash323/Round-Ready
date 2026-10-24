/**
 * Domain types for the RoundReady decision engine.
 *
 * Everything in `src/lib/engine` is pure: it takes plain objects and returns
 * plain objects. No database, no React, no `Date.now()` read from inside a
 * calculation — the current time is always passed in. That is what makes the
 * rules in PRD section 8 testable exhaustively rather than approximately.
 */

/** The placement policies a college actually runs. */
export type PlacementPolicy = "none" | "one_offer" | "dream_threshold";

/**
 * How a secured employer is classified, which decides the multiplier a placed
 * student must clear to sit for anything further.
 */
export type CompanyCategory = "service_based" | "product_based";

/**
 * A placement the student has already secured.
 *
 * Recorded explicitly, never inferred. Applying to a company, being shortlisted
 * or sitting an interview does not make a student placed, and treating it as if
 * it did would wrongly close their whole board.
 *
 * This is distinct from an `offer` application inside RoundReady: that is an
 * offer *received*, which the college policy gate already handles. This is an
 * offer *accepted*, possibly before the student ever opened this tool.
 */
export interface SecuredPlacement {
  company: string;
  ctcLpa: number;
  category: CompanyCategory;
}

/** The student. Every academic field is nullable: a field the student has not
 *  entered produces an `unknown` verdict, never a silent pass. */
export interface Profile {
  cgpa: number | null;
  activeBacklogs: number | null;
  branch: string;
  tenthPercent: number | null;
  twelfthPercent: number | null;
  gapYears: number | null;
  policy: PlacementPolicy;
  /** Required when `policy === "dream_threshold"`, ignored otherwise. */
  dreamCtcLpa: number | null;
  /** A placement already accepted. `null` means the student is unplaced. */
  securedPlacement: SecuredPlacement | null;
}

/**
 * Eligibility criteria as written on the TPO notice.
 *
 * `null` means "the notice did not mention this", and the criterion is then not
 * evaluated at all. It is NOT the same as `0`, which would be a real cutoff
 * that everybody clears. Conflating the two invents cutoffs nobody stated.
 */
export interface Criteria {
  cgpaMin: number | null;
  maxActiveBacklogs: number | null;
  /** An empty array means every branch qualifies — the common case on a notice
   *  that lists no branch restriction. */
  allowedBranches: string[];
  tenthPercentMin: number | null;
  twelfthPercentMin: number | null;
  gapYearsAllowed: number | null;
}

export type RoundType =
  | "pre_placement_talk"
  | "online_test"
  | "group_discussion"
  | "technical_interview"
  | "hr_interview"
  | "other";

export interface Round {
  /**
   * Stable identity, independent of the display name.
   *
   * Two rounds on one drive may legitimately share a name — "Technical
   * Interview" twice is normal. Keying the calendar export or the clash set on
   * the name made the second one collide with the first, and a repeated
   * iCalendar UID is read as an update rather than a second event, so one of
   * the two interviews disappeared from the student's calendar (AUDIT.md D3).
   */
  id: string;
  name: string;
  type: RoundType;
  startAt: Date;
  endAt: Date;
}

export interface Drive {
  id: string;
  company: string;
  role: string;
  ctcLpa: number;
  location: string | null;
  applicationDeadline: Date | null;
  criteria: Criteria;
  rounds: Round[];
}

export type ApplicationStatus =
  | "interested"
  | "applied"
  | "in_progress"
  | "offer"
  | "rejected"
  | "withdrawn";

/** Statuses that end the student's involvement with a drive. */
export const RESOLVED_STATUSES: ApplicationStatus[] = ["offer", "rejected", "withdrawn"];

/** Statuses that remove a drive's rounds from clash detection (PRD R12). */
export const ABANDONED_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn"];

export interface StatusChange {
  status: ApplicationStatus;
  at: Date;
}

export interface Application {
  id: string;
  driveId: string;
  status: ApplicationStatus;
  currentRound: string | null;
  /** Set only when `status === "offer"`. Falls back to the drive's CTC when
   *  absent, so a half-filled record still gates the board correctly. */
  offerCtcLpa: number | null;
  /** Append-only. Status transitions are recorded, never rewritten. */
  history: StatusChange[];
}

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
