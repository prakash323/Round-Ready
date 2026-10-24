import { z } from "zod";

/**
 * Input validation.
 *
 * Validation lives in one module and is used by every write route, so a field
 * cannot be checked in one place and trusted in another. Two rules here are
 * product decisions rather than type hygiene:
 *
 *  - `null` and absent are preserved, never coerced to `0`. A notice that does
 *    not mention a 12th-percentage cutoff must store `null`, because `0` is a
 *    real cutoff that everybody clears, and the difference is what makes the
 *    `unknown` verdict possible.
 *  - A round whose end is not after its start is rejected here, not rendered as
 *    a zero-width event that silently never clashes with anything.
 */

/** Treats "" and "null" as "not provided", which is what an empty form field means. */
const optionalNumber = (min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? NaN : n;
    })
    .refine((v) => v === null || (!Number.isNaN(v) && v >= min && v <= max), {
      message: `must be a number between ${min} and ${max}`,
    });

const optionalInt = (min: number, max: number) =>
  optionalNumber(min, max).refine((v) => v === null || Number.isInteger(v), {
    message: "must be a whole number",
  });

/**
 * An id that will be cast to an ObjectId downstream.
 *
 * Checked by shape here rather than left to the cast. `Types.ObjectId` throws
 * on anything malformed, and a throw from inside a controller is a 500 — an
 * unreadable id is the client's mistake, so it should read as one. The regex
 * rather than a mongoose import keeps this module free of the database, which
 * is what lets the whole schema layer be tested without one.
 */
const objectId = (message = "That is not a valid id") =>
  z.string().trim().regex(/^[0-9a-fA-F]{24}$/, message);

export const policyEnum = z.enum(["none", "one_offer", "dream_threshold"]);

export const roundTypeEnum = z.enum([
  "pre_placement_talk",
  "online_test",
  "group_discussion",
  "technical_interview",
  "hr_interview",
  "other",
]);

export const applicationStatusEnum = z.enum([
  "interested",
  "applied",
  "in_progress",
  "offer",
  "rejected",
  "withdrawn",
]);

/**
 * The graduating years a registration may claim.
 *
 * Derived from the current year rather than written as two literals, which
 * would have started rejecting legitimate first-years the moment the window
 * passed. The range is deliberately generous in both directions: a final-year
 * student registering late and a first-year registering early are both real.
 */
export function gradYearRange(now: Date = new Date()): { min: number; max: number } {
  const year = now.getFullYear();
  return { min: year - 6, max: year + 8 };
}

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters").max(200),
    college: z.string().trim().min(2, "College is required").max(120),
    gradYear: z.coerce
      .number({ invalid_type_error: "Enter your graduating year" })
      .int("Enter a four-digit year")
      .refine(
        (y) => y >= gradYearRange().min && y <= gradYearRange().max,
        () => ({
          message: `Enter a year between ${gradYearRange().min} and ${gradYearRange().max}`,
        }),
      ),
    /**
     * Optional, and absent for every student.
     *
     * Not validated for shape here: the only thing that decides whether it is
     * right is the comparison against the configured code, and a length or
     * pattern rule in this schema would tell an attacker what to generate.
     */
    officerCode: z
      .string()
      .max(200)
      .nullish()
      .transform((v) => (v ?? "").trim() || null),
  })
  // A password that is the email address is the first thing anybody tries, and
  // it survives every length rule because an email is long.
  .refine((v) => v.password.toLowerCase() !== v.email.toLowerCase(), {
    message: "Your password cannot be your email address",
    path: ["password"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const companyCategoryEnum = z.enum(["service_based", "product_based"]);

/**
 * The multiplier a placed student must clear, per company category.
 *
 * Owned by the CDC officer, because it is a statement of college policy rather
 * than a fact about any one student. The bounds are not arbitrary:
 *
 *  - Below 1 the rule inverts. "You may sit for anything paying at least 0.8×
 *    what you already have" lets a placed student take a worse offer, which is
 *    the opposite of what a higher-offer policy is for, so it is refused
 *    rather than stored and puzzled over later.
 *  - Exactly 1 is allowed and means "anything strictly better qualifies",
 *    which is a policy a college might genuinely run.
 *  - Two decimal places, because the threshold is shown to students in LPA and
 *    a multiplier with more precision than that produces a bar nobody can read
 *    back off the number.
 */
const multiplier = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Enter a number for the ${label} multiplier` })
    .min(1, "A multiplier below 1 would let a placed student take a worse offer")
    .max(10, "A multiplier above 10 would close the batch to everyone")
    .refine((n) => Math.round(n * 100) === n * 100, {
      message: "Use at most two decimal places",
    });

export const batchPolicySchema = z.object({
  serviceMultiplier: multiplier("service-based"),
  productMultiplier: multiplier("product-based"),
});

/**
 * A placement the student has already accepted.
 *
 * Every field is required once the student says they are placed, because the
 * gate cannot be computed without all three — and a half-filled record here
 * would either block nothing or block everything. `hasSecuredPlacement` is the
 * explicit switch: being placed is something the student states, never
 * something inferred from having applied somewhere.
 */
export const profileSchema = z
  .object({
    cgpa: optionalNumber(0, 10),
    activeBacklogs: optionalInt(0, 50),
    branch: z.string().trim().min(1, "Branch is required").max(40),
    tenthPercent: optionalNumber(0, 100),
    twelfthPercent: optionalNumber(0, 100),
    gapYears: optionalInt(0, 10),
    policy: policyEnum,
    dreamCtcLpa: optionalNumber(0, 500),

    /**
     * A placement already accepted.
     *
     * `hasSecuredPlacement` is an explicit switch because being placed is
     * something the student states, never something inferred from having
     * applied somewhere or sat an interview. Once it is on, all three fields
     * are required: the gate cannot be computed without them, and a
     * half-filled record would either block nothing or block everything.
     */
    hasSecuredPlacement: z
      .union([z.boolean(), z.string(), z.undefined(), z.null()])
      .transform((v) => v === true || v === "true" || v === "on"),
    securedCompany: z.string().trim().max(120).nullish().transform((v) => v || null),
    securedCtcLpa: optionalNumber(0, 500),
    securedCategory: companyCategoryEnum.nullish().transform((v) => v ?? null),
  })
  // A dream-threshold policy cannot be evaluated without its threshold, so the
  // combination is rejected rather than quietly treated as zero.
  .refine((v) => v.policy !== "dream_threshold" || v.dreamCtcLpa !== null, {
    message: "A dream-threshold policy needs a dream CTC",
    path: ["dreamCtcLpa"],
  })
  .refine((v) => !v.hasSecuredPlacement || (v.securedCompany ?? "") !== "", {
    message: "Name the company you have accepted",
    path: ["securedCompany"],
  })
  .refine((v) => !v.hasSecuredPlacement || v.securedCtcLpa !== null, {
    message: "Enter the package you secured",
    path: ["securedCtcLpa"],
  })
  // Zero would multiply out to a threshold of zero, so every drive would clear
  // a bar that is supposed to be the strictest thing on the board. A placed
  // student would see no gate at all and never learn why.
  .refine((v) => !v.hasSecuredPlacement || (v.securedCtcLpa ?? 0) > 0, {
    message: "A secured package has to be more than zero",
    path: ["securedCtcLpa"],
  })
  .refine((v) => !v.hasSecuredPlacement || v.securedCategory !== null, {
    message: "Choose service-based or product-based — the multiplier depends on it",
    path: ["securedCategory"],
  });

export const criteriaSchema = z.object({
  cgpaMin: optionalNumber(0, 10),
  maxActiveBacklogs: optionalInt(0, 50),
  allowedBranches: z
    .array(z.string().trim().min(1).max(40))
    .max(30)
    .default([])
    .transform((list) => Array.from(new Set(list.map((b) => b.trim()))).filter(Boolean)),
  tenthPercentMin: optionalNumber(0, 100),
  twelfthPercentMin: optionalNumber(0, 100),
  gapYearsAllowed: optionalInt(0, 10),
});

/**
 * A datetime that must have actually been supplied.
 *
 * `z.coerce.date()` is not safe here: `new Date(null)` is the epoch and
 * `new Date(0)` is too, both *valid* dates. The client builds these from
 * `istInputToUtc`, which returns `null` for any string it cannot read — so a
 * malformed input silently became a round on 1 January 1970, which then sits
 * on the board forever as a permanently expired ghost (AUDIT.md D4).
 *
 * Only a non-empty string or a real `Date` is accepted; `null`, `undefined`,
 * a number and a blank string are all rejected by name, so the form can show
 * the error against the right input.
 */
const requiredDate = z
  .union([z.string(), z.date()], { errorMap: () => ({ message: "Enter a date and time" }) })
  .refine((v) => !(typeof v === "string" && v.trim() === ""), "Enter a date and time")
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "That is not a date we can read");

export const roundSchema = z
  .object({
    name: z.string().trim().min(1, "Round name is required").max(80),
    type: roundTypeEnum,
    startAt: requiredDate,
    endAt: requiredDate,
  })
  .refine((r) => r.endAt.getTime() > r.startAt.getTime(), {
    message: "A round must end after it starts",
    path: ["endAt"],
  });

/**
 * A datetime that may be omitted, but must be real when it is given.
 *
 * The same trap as `requiredDate`, one step quieter: `z.coerce.date()` turns
 * `0`, `false` and `null` into 1 January 1970, all of which are *valid* Dates.
 * A deadline on the epoch is permanently in the past, so the drive renders as
 * expired forever and no error is ever shown. The year bounds catch the other
 * direction — a mistyped `20255` is a deadline two hundred centuries out,
 * which silently never expires.
 */
const optionalDate = (message: string) =>
  z
    // The error map matters: without it a number falls through every union
    // member and reports "Invalid input", which tells the officer nothing
    // about which box to look at or what is wrong with it.
    .union([z.string(), z.date(), z.null(), z.undefined()], {
      errorMap: () => ({ message }),
    })
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
      return v instanceof Date ? v : new Date(v);
    })
    .refine((d) => d === null || !Number.isNaN(d.getTime()), message)
    .refine(
      (d) => d === null || (d.getFullYear() >= 2000 && d.getFullYear() <= 2100),
      "That year does not look right",
    );

export const driveSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  role: z.string().trim().min(1, "Role is required").max(120),
  ctcLpa: z.coerce
    .number({ invalid_type_error: "Enter the CTC in LPA" })
    .min(0, "CTC cannot be negative")
    .max(500, "That looks too large to be an LPA figure"),
  location: z.string().trim().max(120).nullish().transform((v) => v || null),
  applicationDeadline: optionalDate("That is not a date we can read"),
  criteria: criteriaSchema,
  rounds: z
    .array(roundSchema)
    .max(20, "A drive cannot have more than 20 rounds")
    .default([])
    // A drive whose own rounds overlap is a typo, not a schedule. Left
    // unchecked it reaches the board as a drive that clashes with itself,
    // which reads as a scheduling conflict the student cannot resolve.
    .superRefine((rounds, ctx) => {
      for (let i = 0; i < rounds.length; i += 1) {
        for (let j = i + 1; j < rounds.length; j += 1) {
          const a = rounds[i];
          const b = rounds[j];
          // Half-open, matching the engine: rounds that merely touch are fine.
          if (a.startAt < b.endAt && a.endAt > b.startAt) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [j, "startAt"],
              message: `This overlaps "${a.name}" on the same drive`,
            });
          }
        }
      }
    }),
});

export const applicationSchema = z
  .object({
    driveId: objectId("Pick a drive from your board"),
    status: applicationStatusEnum,
    currentRound: z.string().trim().max(80).nullish().transform((v) => v || null),
    offerCtcLpa: optionalNumber(0, 500),
  })
  .refine((v) => v.status !== "offer" || v.offerCtcLpa !== null, {
    message: "Recording an offer needs the offered CTC",
    path: ["offerCtcLpa"],
  });

/**
 * Job-description analysis and storage.
 *
 * `source` admits "manual" alongside the analyser's own two values, because a
 * student adding a skill the taxonomy missed is a first-class case — and the
 * provenance has to survive, so the UI can keep showing which rows came from
 * the notice and which from the reader.
 */
export const extractedSkillSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, "A skill needs a name").max(80),
  category: z.string().trim().min(1).max(40),
  importance: z.enum(["required", "preferred"]),
  source: z.enum(["explicit", "inferred", "manual"]),
  evidence: z.string().max(2000).default(""),
  reason: z.string().max(400).nullish().transform((v) => v || null),
});

/** Analysis only — a preview, which writes nothing. */
export const analyseJdSchema = z.object({
  text: z.string().min(1, "Paste the job description first").max(40000),
  driveId: z.string().trim().max(60).nullish().transform((v) => v || null),
});

export const jobDescriptionSchema = z.object({
  driveId: z.string().trim().max(60).nullish().transform((v) => v || null),
  roleTitle: z.string().trim().max(120).nullish().transform((v) => v || null),
  company: z.string().trim().max(120).nullish().transform((v) => v || null),
  rawText: z.string().min(1, "The original description cannot be empty").max(40000),
  skills: z.array(extractedSkillSchema).max(120).default([]),
  responsibilities: z.array(z.string().max(2000)).max(100).default([]),
  qualifications: z.array(z.string().max(2000)).max(100).default([]),
  assessments: z.array(z.string().max(200)).max(40).default([]),
  experienceMinYears: optionalNumber(0, 50),
  gaps: z.array(z.string().max(400)).max(40).default([]),
});

export const proficiencyEnum = z.enum(["none", "beginner", "intermediate", "advanced"]);

/**
 * One self-rated skill.
 *
 * "source" only ever accepts "self_reported" from a client. An
 * assessment-derived level is something the server awards from practice
 * results, and letting a request assert it would turn a guess into a
 * measurement by typing.
 */
export const studentSkillSchema = z.object({
  skillId: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, "A skill needs a name").max(80),
  level: proficiencyEnum,
  source: z.literal("self_reported").default("self_reported"),
});

export const skillProfileSchema = z.object({
  skills: z.array(studentSkillSchema).max(200).default([]),
});

/** Study-plan settings. The plan itself is never submitted — it is derived. */
export const planSettingsSchema = z.object({
  hoursPerDay: optionalNumber(0.5, 16),
  deadline: z
    .union([z.string(), z.date(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : new Date(v)))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "That is not a date we can read"),
  completedTaskIds: z.array(z.string().trim().max(80)).max(500).default([]),
});

/**
 * A link saved to the personal library.
 *
 * Only http(s) is accepted. A "javascript:" or "data:" URL stored here would
 * be rendered as a link the student clicks, which is how a note-taking
 * feature becomes an attack on its own author.
 */
export const savedResourceSchema = z.object({
  skillId: z.string().trim().max(60).nullish().transform((v) => v || null),
  title: z.string().trim().min(1, "Give the link a title").max(160),
  url: z
    .string()
    .trim()
    .min(1, "A link needs a URL")
    .max(2000)
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    }, "Enter a full web address, starting with https://"),
  note: z.string().trim().max(500).default(""),
  curated: z.boolean().default(false),
});

export const simulateSchema = z.object({
  driveId: objectId("Pick a drive to simulate"),
  offerCtcLpa: optionalNumber(0, 500),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type DriveInput = z.infer<typeof driveSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type SimulateInput = z.infer<typeof simulateSchema>;
export type AnalyseJdInput = z.infer<typeof analyseJdSchema>;
export type JobDescriptionInput = z.infer<typeof jobDescriptionSchema>;
export type SkillProfileInput = z.infer<typeof skillProfileSchema>;
export type PlanSettingsInput = z.infer<typeof planSettingsSchema>;
export type SavedResourceInput = z.infer<typeof savedResourceSchema>;
export type BatchPolicyInput = z.infer<typeof batchPolicySchema>;

/** Collapse a ZodError into `{ field: message }`, which is what forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * A study task.
 *
 * `scheduledOn` is a calendar day, validated as a literal `YYYY-MM-DD` string
 * rather than coerced to a Date. Coercion is the bug: `new Date("2026-10-25")`
 * is midnight UTC, which is 05:30 on the 25th in IST — so a task the student
 * put on Saturday comes back on Saturday, but one created near midnight is
 * filed a day out. The day is a label, and labels are strings.
 */
export const studyTaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(160),
  description: z.string().trim().max(2000).default(""),
  scheduledOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
    .refine((day) => {
      // Rejects 2026-02-31, which matches the pattern and is not a date.
      const [y, m, d] = day.split("-").map(Number);
      const probe = new Date(Date.UTC(y, m - 1, d));
      return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
    }, "That is not a real date"),
  startTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 18:30")
    .nullish()
    .transform((v) => v || null),
  durationMinutes: z.coerce
    .number({ invalid_type_error: "Enter a duration in minutes" })
    .int("Use whole minutes")
    .min(5, "A task needs at least 5 minutes")
    .max(600, "Split anything longer than 10 hours into separate sessions"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  skillId: z.string().trim().max(60).nullish().transform((v) => v || null),
  skillLabel: z.string().trim().max(80).nullish().transform((v) => v || null),
  jobDescriptionId: objectId("That is not a valid analysis").nullish().transform((v) => v || null),
  driveId: objectId("That is not a valid drive").nullish().transform((v) => v || null),
});

/** Marking done or not done. Separate from editing, because it is one click. */
export const taskCompletionSchema = z.object({
  done: z.boolean(),
});

export type StudyTaskInput = z.infer<typeof studyTaskSchema>;
export type TaskCompletionInput = z.infer<typeof taskCompletionSchema>;

/**
 * Asking for a proposed study plan. Writes nothing.
 *
 * The deadline is optional: without one the planner uses a two-week horizon,
 * which is a sensible default and is stated on screen rather than hidden.
 */
export const planPreviewSchema = z.object({
  jobDescriptionId: objectId("Pick a role to plan for"),
  hoursPerDay: z.coerce
    .number({ invalid_type_error: "Enter the hours you can study each day" })
    .min(0.5, "Half an hour is the smallest useful day")
    .max(16, "That is more hours than a day has to spare"),
  deadline: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
    .nullish()
    .transform((v) => v || null),
});

/**
 * Committing chosen tasks from a proposal.
 *
 * The client sends back the tasks it is accepting rather than a flag meaning
 * "save it all", so a student who unticks three of fifteen gets twelve. The
 * server re-validates every field: a proposal is a suggestion the client has
 * had its hands on, not a token of authorisation.
 */
export const planCommitSchema = z.object({
  jobDescriptionId: objectId("Pick a role to plan for"),
  tasks: z
    .array(
      z.object({
        planTaskId: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2000).default(""),
        scheduledOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
        durationMinutes: z.coerce.number().int().min(5).max(600),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
        skillId: z.string().trim().max(60).nullish().transform((v) => v || null),
        skillLabel: z.string().trim().max(80).nullish().transform((v) => v || null),
      }),
    )
    .min(1, "Choose at least one task to add")
    .max(200, "That is more tasks than one plan should create"),
});

export type PlanPreviewInput = z.infer<typeof planPreviewSchema>;
export type PlanCommitInput = z.infer<typeof planCommitSchema>;

/**
 * A note.
 *
 * The body is Markdown text with a generous ceiling and no HTML sanitising,
 * because it is never rendered as HTML — the client parses it into React
 * elements. A note containing a script tag is a note containing those words.
 *
 * The title is allowed to be whatever the student typed, including something
 * that looks like a command or a formula. It is their note.
 */
export const noteSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title").max(200),
  body: z.string().max(50_000, "That note is longer than this editor can hold").default(""),
  folder: z.string().trim().max(60).nullish().transform((v) => v || null),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "Twenty tags is enough to find anything")
    .default([])
    // De-duplicated case-insensitively: "DSA" and "dsa" are one tag, and
    // having both would split a student's own notes across two filters.
    .transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const tag of list) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
      return out;
    }),
  pinned: z.boolean().default(false),
  driveId: objectId("That is not a valid drive").nullish().transform((v) => v || null),
  jobDescriptionId: objectId("That is not a valid analysis").nullish().transform((v) => v || null),
  studyTaskId: objectId("That is not a valid task").nullish().transform((v) => v || null),
  skillId: z.string().trim().max(60).nullish().transform((v) => v || null),
  skillLabel: z.string().trim().max(80).nullish().transform((v) => v || null),
});

export type NoteInput = z.infer<typeof noteSchema>;

/** Starting a practice assessment. */
export const startAssessmentSchema = z.object({
  skillId: z.string().trim().min(1, "Pick a topic").max(60),
});

/**
 * Submitting one.
 *
 * Carries only what was chosen, never a score. The server grades against the
 * questions it recorded when the attempt started, so nothing the client sends
 * can decide the mark.
 */
export const submitAssessmentSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(60),
        chosen: z
          .union([z.number().int().min(0).max(9), z.null()])
          .optional()
          .transform((v) => v ?? null),
      }),
    )
    .max(100),
});

export type StartAssessmentInput = z.infer<typeof startAssessmentSchema>;
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;
