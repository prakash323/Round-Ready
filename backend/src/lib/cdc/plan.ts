import { SUPPORTED_SCHEMA_VERSION } from "./types";
import type {
  ExistingDrive,
  FieldChange,
  ImportCandidate,
  ImportEnvelope,
  ImportOutcome,
  ImportPlan,
  NormalisedDrive,
} from "./types";

/**
 * Turning a captured envelope into a plan the student can review.
 *
 * Nothing here writes. The plan says what *would* happen — what is new, what
 * changed and in which fields, what is unchanged, what arrived twice, and what
 * could not be read well enough to import. The student then chooses. An import
 * that silently rewrote a board would be worse than no import, because the
 * board's whole claim is that it reflects what the student checked.
 *
 * Re-syncing is the normal case, not the exception: the same drives arrive
 * every time, and only the handful that moved should produce any change.
 */

/** Matching, in descending order of how much the portal is telling us. */
function matchExisting(
  drive: NormalisedDrive,
  existing: ExistingDrive[],
): { match: ExistingDrive; on: ImportCandidate["matchedOn"] } | null {
  // The portal's own id. Stable across a company renaming a role, which the
  // weaker keys below are not.
  if (drive.externalId !== null) {
    const byId = existing.find((e) => e.externalId === drive.externalId);
    if (byId) return { match: byId, on: "external_id" };
  }

  // The official URL identifies the posting even when the id is absent.
  if (drive.sourceUrl !== null) {
    const byUrl = existing.find((e) => e.sourceUrl === drive.sourceUrl);
    if (byUrl) return { match: byUrl, on: "source_url" };
  }

  // Last resort, and the reason a match is labelled: company and role alone
  // will wrongly merge two genuinely different postings at one company, so
  // the student is shown how the match was made.
  const key = identityKey(drive.company, drive.role);
  const byName = existing.find((e) => identityKey(e.company, e.role) === key);
  return byName ? { match: byName, on: "company_role" } : null;
}

function identityKey(company: string, role: string): string {
  const flatten = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${flatten(company)}::${flatten(role)}`;
}

/**
 * The fields a re-sync is allowed to touch.
 *
 * Only what the portal is authoritative about. A student's application status,
 * their notes and any correction they made to a category are theirs, and are
 * not in this list — so a later sync cannot overwrite them.
 */
const SYNCED_FIELDS = [
  "company",
  "role",
  "ctcLpa",
  "location",
  "applicationDeadline",
  "criteria.cgpaMin",
  "criteria.maxActiveBacklogs",
  "criteria.allowedBranches",
  "criteria.tenthPercentMin",
  "criteria.twelfthPercentMin",
  "criteria.gapYearsAllowed",
] as const;

function valueAt(source: NormalisedDrive | ExistingDrive, path: string): unknown {
  if (!path.startsWith("criteria.")) {
    return (source as unknown as Record<string, unknown>)[path];
  }
  const key = path.slice("criteria.".length) as keyof NormalisedDrive["criteria"];
  return source.criteria[key];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * What changed, field by field.
 *
 * A field the portal no longer states does NOT count as a change to null. The
 * portal omitting a CGPA cutoff this week is far more likely to mean the page
 * rendered differently than that the cutoff was lifted, and silently clearing
 * a criterion would quietly make a student eligible for something they are
 * not. Clearing a field stays a manual act.
 */
export function diffFields(incoming: NormalisedDrive, existing: ExistingDrive): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of SYNCED_FIELDS) {
    const to = valueAt(incoming, field);
    const from = valueAt(existing, field);
    if (to === null || to === undefined) continue;
    if (Array.isArray(to) && to.length === 0 && Array.isArray(from) && from.length > 0) continue;
    if (!sameValue(from, to)) changes.push({ field, from, to });
  }
  return changes;
}

/**
 * Whether there is enough here to import at all.
 *
 * A drive needs an employer, a role and a compensation figure: the engine
 * ranks on CTC and the secured-placement gate compares against it, so a drive
 * without one cannot be evaluated and would sit on the board as a permanent
 * unknown. These go to `needs_review` rather than being dropped, because the
 * student can supply what the portal did not.
 */
function reviewReasons(drive: NormalisedDrive): string[] {
  const reasons: string[] = [];
  if (drive.company.trim() === "") reasons.push("No company name could be read");
  if (drive.role.trim() === "") reasons.push("No role could be read");
  if (drive.ctcLpa === null) {
    reasons.push(
      drive.ctcRaw === null
        ? "No compensation was stated"
        : `Compensation "${drive.ctcRaw}" could not be read as an annual figure`,
    );
  }
  return reasons;
}

export function buildImportPlan(
  envelope: ImportEnvelope,
  normalised: NormalisedDrive[],
  existing: ExistingDrive[],
): ImportPlan {
  const problems: string[] = [];

  if (envelope.source !== "neopat") {
    problems.push(`This capture says it came from "${envelope.source}", which is not supported.`);
  }
  if (envelope.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    problems.push(
      `This capture was made by a different version of the snippet (v${envelope.schemaVersion}; ` +
        `this build reads v${SUPPORTED_SCHEMA_VERSION}). Copy the snippet again from the import page.`,
    );
  }
  if (normalised.length === 0) {
    problems.push(
      "No drives were found in the capture. Open the drives page on the portal, let it finish " +
        "loading, and run the snippet again.",
    );
  }

  const candidates: ImportCandidate[] = [];
  /** Existing drives already claimed by an earlier row in this same capture. */
  const claimed = new Map<string, number>();

  normalised.forEach((drive, index) => {
    const notes: string[] = [];
    for (const note of drive.unreadable) notes.push(note);

    const review = reviewReasons(drive);
    if (review.length > 0) {
      candidates.push({
        outcome: "needs_review",
        drive,
        matchedDriveId: null,
        matchedOn: null,
        changes: [],
        notes: [...notes, ...review],
      });
      return;
    }

    const found = matchExisting(drive, existing);

    // Two rows in one capture landing on the same drive. The portal listing a
    // posting twice is ordinary; importing it twice is not.
    const dedupeKey = found?.match.id ?? identityKey(drive.company, drive.role);
    const seenAt = claimed.get(dedupeKey);
    if (seenAt !== undefined) {
      candidates.push({
        outcome: "duplicate",
        drive,
        matchedDriveId: found?.match.id ?? null,
        matchedOn: found?.on ?? null,
        changes: [],
        notes: [...notes, `The same drive appears earlier in this capture (row ${seenAt + 1}).`],
      });
      return;
    }
    claimed.set(dedupeKey, index);

    if (!found) {
      candidates.push({
        outcome: "new",
        drive,
        matchedDriveId: null,
        matchedOn: null,
        changes: [],
        notes,
      });
      return;
    }

    if (found.on === "company_role") {
      notes.push(
        "Matched on company and role because the portal gave no id for this drive. Check it is " +
          "the same posting before importing.",
      );
    }

    const changes = diffFields(drive, found.match);
    candidates.push({
      outcome: changes.length > 0 ? "changed" : "unchanged",
      drive,
      matchedDriveId: found.match.id,
      matchedOn: found.on,
      changes,
      notes,
    });
  });

  const counts = {
    new: 0,
    changed: 0,
    unchanged: 0,
    duplicate: 0,
    needs_review: 0,
    total: candidates.length,
  } as ImportPlan["counts"];
  for (const candidate of candidates) counts[candidate.outcome] += 1;

  return { candidates, counts, problems };
}

/** The outcomes an import is allowed to act on. The rest are shown, not applied. */
export const IMPORTABLE: ImportOutcome[] = ["new", "changed"];
