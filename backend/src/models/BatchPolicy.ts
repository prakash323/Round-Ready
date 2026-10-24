import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * One batch's placement policy, owned by its CDC officer.
 *
 * Separate from `Profile` because it is a different kind of fact. A profile
 * records what is true of one student; this records what the college has
 * decided for all of them, so it is written by one person and read by three
 * hundred — and a student must not be able to edit the rule that gates them.
 *
 * The row is optional: a batch whose officer has never opened the policy page
 * has no document here and is gated by the standard multipliers. That is why
 * every read goes through `policyFor`, which returns the defaults rather than
 * null, and why nothing in the app branches on "policy missing".
 */
const batchPolicySchema = new Schema(
  {
    batchId: { type: String, required: true },
    serviceMultiplier: { type: Number, required: true, min: 1, max: 10, default: 1.5 },
    productMultiplier: { type: Number, required: true, min: 1, max: 10, default: 2 },
    // Who last changed the rule. A policy that silently differs from the one
    // students were told about is worth being able to attribute.
    updatedBy: { type: Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

// One policy per batch, enforced by the database rather than by the handler,
// so two officers saving at once cannot produce two competing rules.
batchPolicySchema.index({ batchId: 1 }, { unique: true, name: "uniq_batch_policy" });

export type BatchPolicyDoc = InferSchemaType<typeof batchPolicySchema>;

export const BatchPolicy: Model<BatchPolicyDoc> = model<BatchPolicyDoc>(
  "BatchPolicy",
  batchPolicySchema,
);
