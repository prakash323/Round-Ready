import { Types } from "mongoose";
import { StudyTask } from "../models/StudyTask";
import { daysInMonth, studyStreak, summariseDays } from "../lib/planner";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler, notFound } from "../middleware/errorHandler";
import type { StudyTaskInput, TaskCompletionInput } from "../lib/schemas";
import type { PlannerTask } from "../lib/planner";

/**
 * The study planner's tasks.
 *
 * Every query is scoped by `userId` rather than by id alone, so a guessed id
 * returns nothing instead of someone else's evening. That is also why a task
 * belonging to another student is a 404 and not a 403 — a 403 confirms the id
 * exists and is worth guessing at.
 */

function objectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

const toPlannerTask = (doc: {
  _id: Types.ObjectId;
  scheduledOn: string;
  durationMinutes: number;
  // `.lean()` widens an optional Date to include undefined, which the pure
  // layer does not model — absent and "not completed" are the same fact here.
  completedAt?: Date | null;
}): PlannerTask => ({
  id: doc._id.toHexString(),
  scheduledOn: doc.scheduledOn,
  durationMinutes: doc.durationMinutes,
  completedAt: doc.completedAt ?? null,
});

/**
 * A month of the planner, plus the streak.
 *
 * The streak is computed over *all* the student's tasks, not just the month in
 * view — a run that started in September does not reset because the student
 * paged forward to October.
 */
export const listMonth = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);

  const month = String(req.query.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw notFound("Ask for a month as YYYY-MM");
  }

  const days = daysInMonth(month);
  const [monthTasks, allTasks] = await Promise.all([
    StudyTask.find({ userId, scheduledOn: { $gte: days[0], $lte: days[days.length - 1] } })
      .sort({ scheduledOn: 1, startTime: 1, createdAt: 1 })
      .lean(),
    StudyTask.find({ userId, completedAt: { $ne: null } }).select("scheduledOn durationMinutes completedAt").lean(),
  ]);

  const summaries = summariseDays(monthTasks.map(toPlannerTask));

  res.json({
    month,
    tasks: monthTasks,
    // Serialised as a plain object keyed by day, which is what the calendar
    // grid indexes into.
    days: Object.fromEntries([...summaries].map(([day, summary]) => [day, summary])),
    streak: studyStreak(allTasks.map(toPlannerTask), new Date()),
  });
});

export const createTask = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as StudyTaskInput;

  const doc = await StudyTask.create({
    ...input,
    userId: new Types.ObjectId(session.userId),
    // Anything created through this route is the student's own, so it is
    // never replaced by regenerating a plan.
    source: "manual",
  });

  res.status(201).json({ task: doc.toObject() });
});

export const updateTask = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such task");

  const input = req.body as StudyTaskInput;
  const doc = await StudyTask.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(session.userId) },
    {
      $set: {
        ...input,
        // An edited task becomes the student's own, whatever generated it.
        // Otherwise the next regeneration would discard their correction.
        source: "manual",
      },
    },
    { new: true },
  ).lean();

  if (!doc) throw notFound("No such task");
  res.json({ task: doc });
});

/**
 * Marking a task done, or reopening it.
 *
 * `completedAt` is a timestamp rather than a flag because the streak is
 * computed from when work happened, and a boolean cannot answer that.
 * Reopening clears it, which correctly removes that day's contribution.
 */
export const setCompletion = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such task");

  const { done } = req.body as TaskCompletionInput;
  const doc = await StudyTask.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(session.userId) },
    { $set: { completedAt: done ? new Date() : null } },
    { new: true },
  ).lean();

  if (!doc) throw notFound("No such task");
  res.json({ task: doc });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such task");

  const doc = await StudyTask.findOneAndDelete({
    _id: id,
    userId: new Types.ObjectId(session.userId),
  }).lean();

  if (!doc) throw notFound("No such task");
  res.json({ deleted: true });
});
