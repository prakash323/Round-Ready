import { Schema, Types, model } from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

/**
 * One study task on a student's planner.
 *
 * This is the first thing in RoundReady that is *stored* rather than derived,
 * and the distinction is the point. The engine's verdicts are derived because
 * a stored verdict can go stale and lie. A study task is not a verdict — it is
 * something the student intends to do, or has done. That is primary data: it
 * cannot be recomputed from anything, and losing it loses their work.
 *
 * `source` records where it came from. A generated task may be replaced when a
 * plan is regenerated; a manual one never is, and neither is anything already
 * completed. A planner that quietly deleted the evening a student actually
 * sat down and worked would be worse than no planner.
 *
 * `scheduledOn` is a plain `YYYY-MM-DD` string, not a Date. A task belongs to
 * a calendar day, not to an instant: stored as a Date it would be midnight in
 * some zone, and a student in IST opening the planner would find Monday's
 * tasks sitting on Sunday. The day is the fact; the time, when there is one,
 * is a separate optional field.
 */
export const TASK_SOURCES = ["generated", "manual"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;

const studyTaskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },

    /** The calendar day this sits on, as YYYY-MM-DD in the student's zone. */
    scheduledOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** Optional "HH:MM", when the student wants it at a particular time. */
    startTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    durationMinutes: { type: Number, required: true, min: 5, max: 600 },

    priority: { type: String, enum: TASK_PRIORITIES, default: "normal" },
    source: { type: String, enum: TASK_SOURCES, default: "manual" },

    /**
     * The planner task this was generated from, when it was generated.
     *
     * Stable across rebuilds (the engine keys tasks by skill and index), which
     * is what lets a second generation recognise what it already created and
     * add only the rest. Without it, regenerating a plan would either
     * duplicate every task or have to delete and recreate them — and deleting
     * would take the completed ones with it.
     */
    planTaskId: { type: String, default: null, trim: true, maxlength: 120 },

    /** What this is preparation for. All optional — a task can stand alone. */
    skillId: { type: String, default: null, trim: true, maxlength: 60 },
    skillLabel: { type: String, default: null, trim: true, maxlength: 80 },
    jobDescriptionId: { type: Schema.Types.ObjectId, ref: "JobDescription", default: null },
    driveId: { type: Schema.Types.ObjectId, ref: "Drive", default: null },

    /**
     * When it was finished, or null.
     *
     * A timestamp rather than a boolean, because the study streak is computed
     * from *when* work happened and a boolean cannot answer that. It also
     * means reopening a task is not a silent loss of that fact.
     */
    completedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false },
);

// The planner reads one student's month at a time, which is exactly this.
studyTaskSchema.index({ userId: 1, scheduledOn: 1 }, { name: "owner_day" });
// Regeneration asks "which of these have I already made?" — this answers it.
studyTaskSchema.index(
  { userId: 1, jobDescriptionId: 1, planTaskId: 1 },
  { name: "owner_plan_task", partialFilterExpression: { planTaskId: { $type: "string" } } },
);

export type StudyTaskDoc = InferSchemaType<typeof studyTaskSchema> & { _id: Types.ObjectId };

export const StudyTask: Model<StudyTaskDoc> = model<StudyTaskDoc>("StudyTask", studyTaskSchema);
