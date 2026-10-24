import { Schema, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/** The two things an account can be. There is no third, and no "admin". */
export const ROLES = ["student", "cdc_officer"] as const;
export type Role = (typeof ROLES)[number];

/**
 * A member of a batch — a student, or the CDC officer who publishes to them.
 *
 * `batchId` is the sharing key: everyone in the same college and graduating
 * year sees the same drive list. `college` and `gradYear` are kept alongside it
 * rather than discarded after the slug is derived, so the batch can be
 * displayed and corrected later instead of being a one-way door.
 *
 * `role` is set once, at registration, from a code the server holds. It is
 * never read from a request body on any other route, so there is no field a
 * student can send to become an officer — the only way in is the registration
 * check, which is why that check is the one with a rate limiter on it.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true },
    college: { type: String, required: true, trim: true, maxlength: 120 },
    gradYear: { type: Number, required: true },
    batchId: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: ROLES, default: "student" },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false }, versionKey: false },
);

// One account per email, enforced by the database rather than by the register
// handler, so two simultaneous sign-ups cannot both succeed.
userSchema.index({ email: 1 }, { unique: true, name: "uniq_email" });

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> = model<UserDoc>("User", userSchema);
