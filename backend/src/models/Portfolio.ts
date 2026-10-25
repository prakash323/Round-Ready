import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * Everything about a student that is not an eligibility criterion.
 *
 * Deliberately a separate document from `Profile`, which holds CGPA,
 * backlogs and branch. That one is on the hot path — every board read loads
 * it to evaluate every drive — and `SkillProfile` already documents why a
 * list that can run to fifty rows does not belong there. Education history,
 * projects and certificates are read on one page, by one person, occasionally.
 * Putting them in `Profile` would make the board slower for a student who
 * never opens their portfolio.
 *
 * Nothing here feeds an eligibility verdict. It is context: for resume
 * generation, for role recommendations, and for the student's own record.
 *
 * Every section defaults to empty rather than absent, so a profile that
 * predates this document reads as "nothing added yet" without a migration.
 * Mongoose applies these defaults on write; reads go through
 * `emptyPortfolio()` so a missing document behaves identically to an empty one.
 */

/** A URL field that is stored as typed and validated in the schema layer. */
const url = { type: String, default: null, trim: true, maxlength: 400 };

const educationSchema = new Schema(
  {
    institution: { type: String, required: true, trim: true, maxlength: 160 },
    qualification: { type: String, required: true, trim: true, maxlength: 120 },
    /** "2023 – 2027", or a single year. Free text: formats vary by board. */
    period: { type: String, default: null, trim: true, maxlength: 60 },
    /**
     * A percentage and a CGPA are different scales and are never converted
     * into one another — a 9.1 CGPA is not 91%, and the conversion formula
     * differs by university. Both are kept, and whichever the student has is
     * the one that is shown.
     */
    scoreType: { type: String, enum: ["percentage", "cgpa", "grade", null], default: null },
    scoreValue: { type: Number, default: null },
    /** For a letter grade, which has no numeric value. */
    scoreText: { type: String, default: null, trim: true, maxlength: 20 },
    notes: { type: String, default: "", trim: true, maxlength: 600 },
  },
  { _id: true, versionKey: false },
);

const experienceSchema = new Schema(
  {
    organisation: { type: String, required: true, trim: true, maxlength: 160 },
    role: { type: String, required: true, trim: true, maxlength: 160 },
    kind: {
      type: String,
      enum: ["internship", "full_time", "part_time", "freelance", "volunteer"],
      default: "internship",
    },
    startDate: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
    /** Null means ongoing, which is different from unknown. */
    endDate: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
    current: { type: Boolean, default: false },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    technologies: { type: [String], default: () => [] },
  },
  { _id: true, versionKey: false },
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    repoUrl: url,
    liveUrl: url,
    technologies: { type: [String], default: () => [] },
  },
  { _id: true, versionKey: false },
);

const certificateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    issuer: { type: String, default: null, trim: true, maxlength: 160 },
    issuedOn: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
    expiresOn: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
    credentialId: { type: String, default: null, trim: true, maxlength: 120 },
    verificationUrl: url,
    /**
     * Never set by uploading a file.
     *
     * A document being present proves a document is present. Marking a
     * certificate "verified" because the student attached a PDF would make
     * the word worthless on every certificate that genuinely was checked.
     */
    verified: { type: Boolean, default: false },
  },
  { _id: true, versionKey: false },
);

const codingProfileSchema = new Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ["github", "leetcode", "codeforces", "hackerrank", "codechef", "other"],
    },
    /** Shown when the platform is "other". */
    platformName: { type: String, default: null, trim: true, maxlength: 60 },
    username: { type: String, default: null, trim: true, maxlength: 120 },
    profileUrl: { type: String, required: true, trim: true, maxlength: 400 },
    preferred: { type: Boolean, default: false },
    notes: { type: String, default: "", trim: true, maxlength: 300 },
    /**
     * No metrics are stored. RoundReady has no integration with any of these
     * platforms, so a repository count or contest rating here would be a
     * number nobody fetched. A linked account is a link, not evidence.
     */
  },
  { _id: true, versionKey: false },
);

const portfolioSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // --- Personal. Contact details are private to the student. ---
    phone: { type: String, default: null, trim: true, maxlength: 20 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    summary: { type: String, default: "", trim: true, maxlength: 1200 },
    portfolioUrl: url,
    linkedinUrl: url,
    githubUrl: url,

    education: { type: [educationSchema], default: () => [] },
    experience: { type: [experienceSchema], default: () => [] },
    projects: { type: [projectSchema], default: () => [] },
    certificates: { type: [certificateSchema], default: () => [] },
    codingProfiles: { type: [codingProfileSchema], default: () => [] },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

portfolioSchema.index({ userId: 1 }, { unique: true, name: "uniq_portfolio_per_user" });

export type PortfolioDoc = InferSchemaType<typeof portfolioSchema> & { _id: Types.ObjectId };

export const Portfolio: Model<PortfolioDoc> = model<PortfolioDoc>("Portfolio", portfolioSchema);

/**
 * What a student with no portfolio document looks like.
 *
 * Returned rather than null so no caller branches on "portfolio missing" —
 * the same reason `multipliersFor` returns the standard numbers rather than
 * null, and the reason nothing needs migrating when this ships.
 */
export function emptyPortfolio() {
  return {
    phone: null,
    city: null,
    summary: "",
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    education: [],
    experience: [],
    projects: [],
    certificates: [],
    codingProfiles: [],
  };
}
