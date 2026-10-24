import { Types } from "mongoose";
import { analyseJobDescription } from "../lib/jd";
import { Drive } from "../models/Drive";
import { JobDescription } from "../models/JobDescription";
import { liveDriveFilter } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { HttpError, asyncHandler, notFound } from "../middleware/errorHandler";
import type { AnalyseJdInput, JobDescriptionInput } from "../lib/schemas";

function objectId(value: string | null): Types.ObjectId | null {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

/**
 * Analyse a description without saving it.
 *
 * A read-only POST, like `/api/simulate`: the body carries the text, the
 * response carries the structure, and nothing is written. The student reviews
 * and corrects the result before any of it becomes theirs.
 */
export const postAnalyse = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as AnalyseJdInput;

  // When the request names a drive, its company and role seed the analysis —
  // but only as a fallback, and only after checking the drive is one this
  // student's batch can actually see.
  let fallbackRole: string | null = null;
  let fallbackCompany: string | null = null;
  const driveId = objectId(input.driveId);
  if (driveId) {
    const drive = await Drive.findOne({
      _id: driveId,
      ...liveDriveFilter(session.batchId, session.userId),
    }).lean();
    if (!drive) throw notFound();
    fallbackRole = drive.role;
    fallbackCompany = drive.company;
  }

  res.json({ analysis: analyseJobDescription(input.text, { fallbackRole, fallbackCompany }) });
});

export const listJobDescriptions = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const docs = await JobDescription.find({ userId: new Types.ObjectId(session.userId) })
    .sort({ updatedAt: -1 })
    // The list does not need the full text of every description.
    .select("-rawText -responsibilities -qualifications")
    .lean();
  res.json({ jobDescriptions: docs });
});

export const getJobDescription = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such job description");

  // Scoped by userId, not merely by id: a guessed id must return nothing.
  const doc = await JobDescription.findOne({
    _id: id,
    userId: new Types.ObjectId(session.userId),
  }).lean();
  if (!doc) throw notFound("No such job description");
  res.json({ jobDescription: doc });
});

/** The saved analysis for a drive, if this student has one. */
export const getForDrive = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const driveId = objectId(req.params.driveId);
  if (!driveId) throw notFound("No such drive");

  const doc = await JobDescription.findOne({
    userId: new Types.ObjectId(session.userId),
    driveId,
  }).lean();
  res.json({ jobDescription: doc ?? null });
});

/**
 * Save, or replace this student's analysis for the same drive.
 *
 * Upserted on `(userId, driveId)` so "Prepare for this role" reopens the one
 * workspace rather than accumulating a new one per visit — the unique partial
 * index makes that a database guarantee rather than a convention here.
 */
export const putJobDescription = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as JobDescriptionInput;
  const userId = new Types.ObjectId(session.userId);
  const driveId = objectId(input.driveId);

  if (driveId) {
    const drive = await Drive.findOne({
      _id: driveId,
      ...liveDriveFilter(session.batchId, session.userId),
    }).lean();
    if (!drive) throw notFound();
  }

  const fields = {
    roleTitle: input.roleTitle,
    company: input.company,
    rawText: input.rawText,
    skills: input.skills,
    responsibilities: input.responsibilities,
    qualifications: input.qualifications,
    assessments: input.assessments,
    experienceMinYears: input.experienceMinYears,
    gaps: input.gaps,
  };

  const doc = driveId
    ? await JobDescription.findOneAndUpdate(
        { userId, driveId },
        { $set: fields, $setOnInsert: { userId, driveId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean()
    : (await JobDescription.create({ ...fields, userId, driveId: null })).toObject();

  res.status(201).json({ jobDescription: doc });
});

/** Correct a saved analysis. Only the student's own record, only its own fields. */
export const patchJobDescription = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such job description");

  const input = req.body as JobDescriptionInput;
  const doc = await JobDescription.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(session.userId) },
    {
      $set: {
        roleTitle: input.roleTitle,
        company: input.company,
        rawText: input.rawText,
        skills: input.skills,
        responsibilities: input.responsibilities,
        qualifications: input.qualifications,
        assessments: input.assessments,
        experienceMinYears: input.experienceMinYears,
        gaps: input.gaps,
        // Marks the analysis as the student's rather than the analyser's, so a
        // later re-run can tell it has corrections to preserve.
        editedAt: new Date(),
      },
    },
    { new: true },
  ).lean();

  if (!doc) throw notFound("No such job description");
  res.json({ jobDescription: doc });
});

export const deleteJobDescription = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such job description");

  const { deletedCount } = await JobDescription.deleteOne({
    _id: id,
    userId: new Types.ObjectId(session.userId),
  });
  if (deletedCount === 0) throw new HttpError(404, "No such job description");
  res.json({ deleted: true });
});
