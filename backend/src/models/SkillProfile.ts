import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * What the student says they can do.
 *
 * Kept out of `Profile` on purpose. That document is the academic record every
 * board read loads on every page; this one is read only inside a preparation
 * workspace, and growing the hot path with a list that can run to fifty rows
 * would make the board slower for a student who never opens Preparation.
 *
 * A skill absent from this list is **unrated**, which is not the same as
 * "none". The gap analysis reports it as undecided, for the same reason a
 * blank 12th percentage produces `unknown` rather than a failed criterion.
 */
const studentSkillSchema = new Schema(
  {
    skillId: { type: String, required: true, maxlength: 60 },
    /** Carried so a skill the student typed keeps its name if the taxonomy
     *  never knew it. */
    label: { type: String, required: true, maxlength: 80 },
    level: {
      type: String,
      enum: ["none", "beginner", "intermediate", "advanced"],
      required: true,
    },
    /**
     * Where the figure came from. Only "self_reported" is produced today;
     * "assessment" exists so practice results can never be silently merged
     * into self-assessment once they do.
     */
    source: {
      type: String,
      enum: ["self_reported", "assessment"],
      default: "self_reported",
      required: true,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, versionKey: false },
);

const skillProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    skills: { type: [studentSkillSchema], default: () => [] },
  },
  { timestamps: true, versionKey: false },
);

// One per student; the upsert in the controller relies on it.
skillProfileSchema.index({ userId: 1 }, { unique: true, name: "uniq_skill_profile" });

export type SkillProfileDoc = InferSchemaType<typeof skillProfileSchema> & {
  _id: Types.ObjectId;
};

export const SkillProfile: Model<SkillProfileDoc> = model<SkillProfileDoc>(
  "SkillProfile",
  skillProfileSchema,
);
