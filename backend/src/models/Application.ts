import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

const STATUSES = [
  "interested",
  "applied",
  "in_progress",
  "offer",
  "rejected",
  "withdrawn",
] as const;

/**
 * One student's involvement with one drive. Private to that student.
 *
 * `history` is append-only: a re-save of an unchanged status does not add a
 * duplicate entry, so "when did I apply?" stays answerable. Only the *current*
 * status gates anything — an application that reached `offer` and was then
 * withdrawn blocks nothing (PRD R11), which is why the policy gate reads live
 * state rather than replaying history.
 */
const statusChangeSchema = new Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    at: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

const applicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    driveId: { type: Schema.Types.ObjectId, ref: "Drive", required: true },
    status: { type: String, enum: STATUSES, required: true },
    currentRound: { type: String, default: null, trim: true, maxlength: 80 },
    /** Set only when `status === "offer"`. Falls back to the drive's CTC when
     *  absent, so a half-filled record still gates the board correctly. */
    offerCtcLpa: { type: Number, default: null },
    history: { type: [statusChangeSchema], default: () => [] },
  },
  { timestamps: { createdAt: false, updatedAt: "updatedAt" }, versionKey: false },
);

/**
 * One application per student per drive, as a database guarantee rather than a
 * UI convention — so a double-submitted form cannot leave two conflicting
 * statuses for the same company. Logic that can be bypassed is not a guarantee.
 */
applicationSchema.index({ userId: 1, driveId: 1 }, { unique: true, name: "uniq_application" });

export type ApplicationDoc = InferSchemaType<typeof applicationSchema> & { _id: Types.ObjectId };

export const Application: Model<ApplicationDoc> = model<ApplicationDoc>(
  "Application",
  applicationSchema,
);
