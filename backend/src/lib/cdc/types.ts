/**
 * The CDC portal import, as a contract rather than a scraper.
 *
 * The portal (NeoPAT) is an Angular SPA behind Cloudflare, with a Turnstile
 * CAPTCHA on its login and no CORS headers for any other origin. Three things
 * follow, and they decided this whole design:
 *
 *  - RoundReady's backend cannot fetch it. Cloudflare blocks non-browser
 *    clients, and signing in server-side would mean defeating a CAPTCHA.
 *  - RoundReady's frontend cannot fetch it either: the preflight from our
 *    origin is a hard 403 with no `Access-Control-Allow-*` at all.
 *  - So the only code that can read a student's drives is code running on the
 *    portal's own origin, inside the session they opened themselves.
 *
 * The student therefore runs a snippet in their own portal tab and pastes the
 * result here. No password, cookie or token ever reaches this server — the
 * only thing that crosses is drive data the student was already looking at.
 *
 * Everything in this module is pure. It takes the pasted envelope and returns
 * a plan; it does not write, and it does not know what a Mongoose document is.
 */

/** What the snippet produces. Versioned, because the portal will change. */
export interface ImportEnvelope {
  source: "neopat";
  schemaVersion: number;
  /** The page the student captured from, kept for provenance. */
  sourceUrl: string | null;
  capturedAt: string;
  /** Opaque portal records. Shape is the portal's, not ours. */
  drives: unknown[];
}

export const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * One drive, normalised into RoundReady's vocabulary.
 *
 * `null` means the portal did not state it — never zero, never false, never a
 * guess. `*Raw` fields keep the portal's own text beside the parsed value, so
 * a figure that was read wrongly can still be checked against what was
 * actually written, and so nothing is lost by normalising.
 */
export interface NormalisedDrive {
  /** The portal's `drive_id`, when present: the stable identity for re-sync. */
  externalId: string | null;
  sourceUrl: string | null;

  company: string;
  role: string;

  ctcLpa: number | null;
  /** Exactly as the portal wrote it — "12 LPA", "₹8,50,000", "45k/month". */
  ctcRaw: string | null;

  location: string | null;
  applicationDeadline: string | null;
  deadlineRaw: string | null;

  criteria: {
    cgpaMin: number | null;
    maxActiveBacklogs: number | null;
    allowedBranches: string[];
    tenthPercentMin: number | null;
    twelfthPercentMin: number | null;
    gapYearsAllowed: number | null;
  };

  rounds: { name: string; type: string; startAt: string; endAt: string }[];

  /**
   * Only ever set when the portal states it. RoundReady must not guess whether
   * an employer is service- or product-based: that choice moves a placed
   * student's bar between 1.5x and 2x of their package, which decides whether
   * they may sit for a drive at all.
   */
  category: "service_based" | "product_based" | null;

  /** The original description, kept alongside the structured fields. */
  description: string | null;
  skills: string[];

  /**
   * Fields present on the portal record that this adapter could not read.
   * Reported to the student rather than dropped, because a silently missing
   * CGPA cutoff is how a tool becomes confidently wrong.
   */
  unreadable: string[];
}

/** What changed on one field, for the preview and for the record. */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export type ImportOutcome =
  | "new"
  | "changed"
  | "unchanged"
  /** A second incoming row resolving to the same drive as an earlier one. */
  | "duplicate"
  /** Not enough readable information to import safely. */
  | "needs_review";

export interface ImportCandidate {
  outcome: ImportOutcome;
  drive: NormalisedDrive;
  /** The id of the RoundReady drive this matches, when it matches one. */
  matchedDriveId: string | null;
  /** How the match was made, so a surprising match can be understood. */
  matchedOn: "external_id" | "source_url" | "company_role" | null;
  changes: FieldChange[];
  /** Why it needs review, or why it was treated as a duplicate. */
  notes: string[];
}

export interface ImportPlan {
  candidates: ImportCandidate[];
  counts: Record<ImportOutcome, number> & { total: number };
  /** Envelope-level problems: wrong source, unsupported version, empty. */
  problems: string[];
}

/** The existing RoundReady drives a plan is computed against. */
export interface ExistingDrive {
  id: string;
  externalId: string | null;
  sourceUrl: string | null;
  company: string;
  role: string;
  ctcLpa: number;
  location: string | null;
  applicationDeadline: string | null;
  criteria: NormalisedDrive["criteria"];
}
