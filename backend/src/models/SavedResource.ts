import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * A link the student kept.
 *
 * Two sources end up here: one of the curated resources they chose to save,
 * and anything they found themselves. Both are stored the same way, because
 * from the student's side they are the same thing — their library.
 *
 * `curated` records which it was, so the UI can stop offering a curated link
 * that has already been saved without pretending the student wrote it.
 */
const savedResourceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** The skill this belongs to, when it was saved against one. */
    skillId: { type: String, default: null, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    curated: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

savedResourceSchema.index({ userId: 1, skillId: 1 }, { name: "user_skill" });
// The same link twice under one skill is always a mistake, never an intent.
savedResourceSchema.index(
  { userId: 1, skillId: 1, url: 1 },
  { unique: true, name: "uniq_user_skill_url" },
);

export type SavedResourceDoc = InferSchemaType<typeof savedResourceSchema> & {
  _id: Types.ObjectId;
};

export const SavedResource: Model<SavedResourceDoc> = model<SavedResourceDoc>(
  "SavedResource",
  savedResourceSchema,
);
