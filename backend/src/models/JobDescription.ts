import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * A job description a student saved, with the analysis they accepted.
 *
 * Private to one student. Two things are stored deliberately:
 *
 * `rawText` is kept forever so the student can check the analysis against what
 * the notice actually said. An analyser the reader cannot audit is one they
 * have to take on faith, which is exactly what this product refuses to ask of
 * them elsewhere.
 *
 * `skills` is the *edited* list, not the analyser's output. The analysis is a
 * starting point the student corrects — adding what the taxonomy missed,
 * deleting what it got wrong — and their corrections must survive a re-run.
 * Re-analysing overwrites the derived prose; it never silently discards an
 * edit, which is why `editedAt` is tracked separately.
 */

const extractedSkillSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 80 },
    category: { type: String, required: true },
    importance: { type: String, enum: ["required", "preferred"], required: true },
    source: { type: String, enum: ["explicit", "inferred", "manual"], required: true },
    evidence: { type: String, default: "", maxlength: 2000 },
    reason: { type: String, default: null, maxlength: 400 },
  },
  { _id: false, versionKey: false },
);

const jobDescriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** The drive this was prepared for, when it came from one. */
    driveId: { type: Schema.Types.ObjectId, ref: "Drive", default: null },

    roleTitle: { type: String, default: null, trim: true, maxlength: 120 },
    company: { type: String, default: null, trim: true, maxlength: 120 },

    /** Verbatim, so the analysis can always be checked against the source. */
    rawText: { type: String, required: true, maxlength: 40000 },

    skills: { type: [extractedSkillSchema], default: () => [] },
    responsibilities: { type: [String], default: () => [] },
    qualifications: { type: [String], default: () => [] },
    assessments: { type: [String], default: () => [] },
    experienceMinYears: { type: Number, default: null },
    /** What the analyser could not determine, kept so the UI can say so. */
    gaps: { type: [String], default: () => [] },

    /** Set once the student changes anything the analyser produced. */
    editedAt: { type: Date, default: null },

    /**
     * Study-plan inputs — not the plan.
     *
     * The schedule is derived on every read, so only what the student chose
     * is stored: how long they can study, when they need to be ready, and
     * which task ids they have ticked. Completion lives outside the thing
     * being rebuilt, which is why reshaping the plan can never discard it.
     */
    planHoursPerDay: { type: Number, default: 2 },
    planDeadline: { type: Date, default: null },
    completedTaskIds: { type: [String], default: () => [] },
  },
  { timestamps: true, versionKey: false },
);

// A student's own list, newest first — the only query this collection serves.
jobDescriptionSchema.index({ userId: 1, updatedAt: -1 }, { name: "user_recent" });
// At most one saved analysis per drive per student, so "Prepare for this role"
// reopens the existing workspace instead of quietly creating a second one.
jobDescriptionSchema.index(
  { userId: 1, driveId: 1 },
  { unique: true, partialFilterExpression: { driveId: { $type: "objectId" } }, name: "uniq_user_drive" },
);

export type JobDescriptionDoc = InferSchemaType<typeof jobDescriptionSchema> & {
  _id: Types.ObjectId;
};

export const JobDescription: Model<JobDescriptionDoc> = model<JobDescriptionDoc>(
  "JobDescription",
  jobDescriptionSchema,
);
