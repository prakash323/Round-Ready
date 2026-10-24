import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * One attempt at a practice assessment.
 *
 * The questions asked are recorded when the attempt starts, so submission is
 * graded against what was actually put in front of the student rather than
 * against whatever the client sends back. Without that, a submission could
 * name four easy questions it was never asked.
 *
 * The score is computed on the server and stored; the client's arithmetic is
 * never read. A score the browser calculated is a score the browser can
 * choose, and this one feeds a proficiency suggestion.
 */
const assessmentAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    skillId: { type: String, required: true, trim: true, maxlength: 60 },
    skillLabel: { type: String, required: true, trim: true, maxlength: 80 },

    /** Exactly what was asked, in order. */
    questionIds: { type: [String], required: true },
    answers: {
      type: [
        new Schema(
          {
            questionId: { type: String, required: true },
            // null is a deliberate skip, and is scored as wrong.
            chosen: { type: Number, default: null },
            correct: { type: Boolean, required: true },
          },
          { _id: false, versionKey: false },
        ),
      ],
      default: () => [],
    },

    total: { type: Number, default: 0 },
    attempted: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    scorePercent: { type: Number, default: 0 },

    startedAt: { type: Date, required: true },
    /** Null while the attempt is still open. */
    submittedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

// History for one student, newest first, and the per-skill view of it.
assessmentAttemptSchema.index({ userId: 1, submittedAt: -1 }, { name: "owner_recent" });
assessmentAttemptSchema.index({ userId: 1, skillId: 1 }, { name: "owner_skill" });

export type AssessmentAttemptDoc = InferSchemaType<typeof assessmentAttemptSchema> & {
  _id: Types.ObjectId;
};

export const AssessmentAttempt: Model<AssessmentAttemptDoc> = model<AssessmentAttemptDoc>(
  "AssessmentAttempt",
  assessmentAttemptSchema,
);
