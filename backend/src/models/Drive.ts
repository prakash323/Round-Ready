import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * A drive, shared across a batch.
 *
 * Note what is absent: no `isEligible`, no `hasClash`, no `blockedByPolicy`, no
 * `priorityScore`. Every verdict is derived at read time from the profile, the
 * drives and the applications (PRD section 7). A stored verdict would need a
 * fan-out update that can partially fail, and a stale "eligible" badge is
 * precisely the failure this tool exists to prevent.
 *
 * Drives carry no student-specific field at all, which is what lets one row be
 * read by thirty classmates without leaking anything: eligibility is a function
 * of (profile, criteria), evaluated per reader.
 */

/**
 * Rounds are a subdocument array, so each one gets its own `_id`.
 *
 * That id is what the calendar export and the clash set are keyed on. Keying
 * them on the round *name* meant two rounds both called "Technical Interview"
 * emitted the same iCalendar UID, and a calendar client treated the second as
 * an update to the first — so one of the two interviews silently vanished from
 * the student's phone (AUDIT.md D3).
 */
const roundSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: {
      type: String,
      enum: [
        "pre_placement_talk",
        "online_test",
        "group_discussion",
        "technical_interview",
        "hr_interview",
        "other",
      ],
      required: true,
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
  },
  { _id: true, versionKey: false },
);

/**
 * `null` means "the notice did not mention this", and the criterion is then not
 * evaluated at all. It is NOT the same as `0`, which is a real cutoff that
 * everybody clears. Conflating the two invents cutoffs nobody stated and makes
 * the `unknown` verdict impossible, so every field defaults to `null`.
 */
const criteriaSchema = new Schema(
  {
    cgpaMin: { type: Number, default: null },
    maxActiveBacklogs: { type: Number, default: null },
    // An empty array means every branch qualifies — the common case on a notice
    // that lists no branch restriction.
    allowedBranches: { type: [String], default: () => [] },
    tenthPercentMin: { type: Number, default: null },
    twelfthPercentMin: { type: Number, default: null },
    gapYearsAllowed: { type: Number, default: null },
  },
  { _id: false, versionKey: false },
);

/**
 * Where a drive's eligibility criteria came from.
 *
 * `portal` rows arrive with no academic cutoffs at all — NeoPAT's
 * student-facing payload carries none — so an imported drive must say that it
 * does not know, rather than let an empty criteria block read like a notice
 * that genuinely stated no requirements. `manual` is a student's own
 * correction and survives every later sync.
 */
export const CRITERIA_SOURCES = ["stated", "portal_unknown", "manual"] as const;
export type CriteriaSource = (typeof CRITERIA_SOURCES)[number];

const driveSchema = new Schema(
  {
    batchId: { type: String, required: true },

    /**
     * Who may see this drive.
     *
     * `null` means the whole batch: a notice the CDC officer published, which
     * is what every drive was before the portal import existed. Existing rows
     * therefore need no migration and no backfill — absent reads as null,
     * which is exactly the behaviour they already had.
     *
     * Set means the drive is private to that one student. A drive imported
     * from someone's own CDC portal account is theirs: it reflects what *they*
     * were shown, and publishing it to three hundred classmates would both
     * bypass the officer rule and put drives on boards that may not be
     * eligible for them.
     */
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },

    /** `manual` for a drive someone typed in; `cdc_portal` for an import. */
    source: { type: String, enum: ["manual", "cdc_portal"], default: "manual" },
    /** The portal's own `drive_id`. The stable identity across re-syncs. */
    externalId: { type: String, default: null },
    /** The official posting, kept so a student can check against the source. */
    sourceUrl: { type: String, default: null },
    syncedAt: { type: Date, default: null },
    criteriaSource: { type: String, enum: CRITERIA_SOURCES, default: "stated" },
    /**
     * The compensation exactly as the portal expressed it, in words.
     *
     * Kept beside the parsed LPA figure so a misread can be checked against
     * what was actually written. Only this line is retained, not the whole
     * portal record: nothing is served by storing a blob of someone else's
     * payload on our database.
     */
    ctcRaw: { type: String, default: null },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    ctcLpa: { type: Number, required: true },
    location: { type: String, default: null, trim: true, maxlength: 120 },
    applicationDeadline: { type: Date, default: null },
    criteria: { type: criteriaSchema, required: true, default: () => ({}) },
    rounds: { type: [roundSchema], default: () => [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /**
     * Soft delete (AUDIT.md D1). A drive is shared, and other students'
     * applications reference it; destroying the row left every classmate
     * holding an application that pointed at nothing, which the policy gate
     * then valued at zero CTC and used to block their whole board. Filtered at
     * read time instead.
     */
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }, versionKey: false },
);

driveSchema.index({ batchId: 1, "rounds.startAt": 1 }, { name: "batch_round_start" });
driveSchema.index({ batchId: 1, company: 1, role: 1 }, { name: "batch_company_role" });
// Re-sync looks a drive up by its portal id within one student's own set. The
// index is partial so the many rows with no external id do not enter it.
driveSchema.index(
  { ownerId: 1, externalId: 1 },
  { name: "owner_external", partialFilterExpression: { externalId: { $type: "string" } } },
);

export type DriveDoc = InferSchemaType<typeof driveSchema> & { _id: Types.ObjectId };

export const Drive: Model<DriveDoc> = model<DriveDoc>("Drive", driveSchema);

/** Every read of a shared drive goes through this, so a soft-deleted row
 *  cannot reappear on someone's board by being forgotten at one call site. */
export const LIVE_DRIVE = { deletedAt: null } as const;
