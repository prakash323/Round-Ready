import { Types } from "mongoose";
import { analyseGaps, buildPlan } from "../lib/jd";
import { JobDescription } from "../models/JobDescription";
import { SkillProfile } from "../models/SkillProfile";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler, notFound } from "../middleware/errorHandler";
import type { ExtractedSkill, StudentSkill } from "../lib/jd";
import type { PlanSettingsInput, SkillProfileInput } from "../lib/schemas";

/** The student's own skill ratings. Private, and scoped by userId throughout. */
export const getSkills = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const doc = await SkillProfile.findOne({
    userId: new Types.ObjectId(session.userId),
  }).lean();
  res.json({ skills: doc?.skills ?? [] });
});

/**
 * Replace the list.
 *
 * A whole-list PUT rather than per-skill patches: the editor shows every row
 * at once, and reconciling partial updates against a list the student is
 * reordering in front of them is a race nobody needs.
 */
export const putSkills = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as SkillProfileInput;
  const userId = new Types.ObjectId(session.userId);
  const now = new Date();

  const doc = await SkillProfile.findOneAndUpdate(
    { userId },
    {
      $set: { skills: input.skills.map((s) => ({ ...s, updatedAt: now })) },
      $setOnInsert: { userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({ skills: doc?.skills ?? [] });
});

/**
 * The gap between one saved analysis and the student's ratings.
 *
 * Computed on demand and never stored, for the same reason the placement board
 * is not: rating a skill must re-evaluate every gap at once, and a cached
 * figure is one that can disagree with the rating beside it.
 */
export const getGaps = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw notFound("No such job description");

  const [jd, profile] = await Promise.all([
    JobDescription.findOne({ _id: new Types.ObjectId(id), userId }).lean(),
    SkillProfile.findOne({ userId }).lean(),
  ]);
  if (!jd) throw notFound("No such job description");

  const analysis = analyseGaps(
    jd.skills as unknown as ExtractedSkill[],
    (profile?.skills ?? []) as unknown as StudentSkill[],
  );
  res.json({ ...analysis, jobDescriptionId: id });
});

/**
 * The study plan for one saved analysis.
 *
 * Derived on every read from the gaps, the settings and the tick list — never
 * stored. Rating a skill or moving the deadline reshapes the schedule on the
 * next load, and the ticks survive because they were never part of what gets
 * rebuilt.
 */
export const getPlan = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw notFound("No such job description");

  const [jd, profile] = await Promise.all([
    JobDescription.findOne({ _id: new Types.ObjectId(id), userId }).lean(),
    SkillProfile.findOne({ userId }).lean(),
  ]);
  if (!jd) throw notFound("No such job description");

  const { gaps } = analyseGaps(
    jd.skills as unknown as ExtractedSkill[],
    (profile?.skills ?? []) as unknown as StudentSkill[],
  );

  const plan = buildPlan({
    gaps,
    settings: {
      hoursPerDay: jd.planHoursPerDay ?? 2,
      deadline: jd.planDeadline ?? null,
      completedTaskIds: jd.completedTaskIds ?? [],
    },
    startOn: new Date(),
  });

  res.json({
    plan,
    settings: {
      hoursPerDay: jd.planHoursPerDay ?? 2,
      deadline: jd.planDeadline ?? null,
      completedTaskIds: jd.completedTaskIds ?? [],
    },
  });
});

/** Change the inputs: hours a day, the deadline, or which tasks are ticked. */
export const patchPlan = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as PlanSettingsInput;
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw notFound("No such job description");

  const doc = await JobDescription.findOneAndUpdate(
    { _id: new Types.ObjectId(id), userId: new Types.ObjectId(session.userId) },
    {
      $set: {
        planHoursPerDay: input.hoursPerDay ?? 2,
        planDeadline: input.deadline,
        completedTaskIds: input.completedTaskIds,
      },
    },
    { new: true },
  ).lean();
  if (!doc) throw notFound("No such job description");

  res.json({
    settings: {
      hoursPerDay: doc.planHoursPerDay ?? 2,
      deadline: doc.planDeadline ?? null,
      completedTaskIds: doc.completedTaskIds ?? [],
    },
  });
});
