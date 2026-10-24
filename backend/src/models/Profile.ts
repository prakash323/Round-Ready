import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * The numbers every eligibility verdict is computed against.
 *
 * Every academic field is nullable and defaults to `null`, never to `0`. A
 * student who has not entered their 12th percentage is not eligible for a drive
 * requiring 60% — their eligibility is *undecided*, and guessing in their
 * favour costs them a drive. `default: null` rather than an absent field is
 * what keeps that distinction explicit in the stored document.
 */
const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cgpa: { type: Number, default: null },
    activeBacklogs: { type: Number, default: null },
    branch: { type: String, default: "", trim: true, maxlength: 40 },
    tenthPercent: { type: Number, default: null },
    twelfthPercent: { type: Number, default: null },
    gapYears: { type: Number, default: null },
    policy: {
      type: String,
      enum: ["none", "one_offer", "dream_threshold"],
      default: "none",
      required: true,
    },
    dreamCtcLpa: { type: Number, default: null },

    /**
     * A placement already accepted, recorded explicitly.
     *
     * Not derived from an application reaching `offer`: an offer received is
     * not an offer accepted, and treating the two as the same would close a
     * student’s board the moment a company called them.
     */
    hasSecuredPlacement: { type: Boolean, default: false },
    securedCompany: { type: String, default: null, trim: true, maxlength: 120 },
    securedCtcLpa: { type: Number, default: null },
    securedCategory: {
      type: String,
      enum: ["service_based", "product_based", null],
      default: null,
    },
  },
  { timestamps: { createdAt: false, updatedAt: "updatedAt" }, versionKey: false },
);

// One profile per student. The upsert in the controller relies on this.
profileSchema.index({ userId: 1 }, { unique: true, name: "uniq_profile_per_user" });

export type ProfileDoc = InferSchemaType<typeof profileSchema> & { _id: Types.ObjectId };

export const Profile: Model<ProfileDoc> = model<ProfileDoc>("Profile", profileSchema);
