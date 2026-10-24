import { Types } from "mongoose";
import { guideFor } from "../lib/jd";
import { SavedResource } from "../models/SavedResource";
import { sessionOf } from "../middleware/requireAuth";
import { HttpError, asyncHandler, notFound } from "../middleware/errorHandler";
import type { SavedResourceInput } from "../lib/schemas";

/**
 * Curated guidance for one skill, plus whatever this student has saved
 * against it.
 *
 * The curated half is static and the same for everyone; the saved half is
 * private. They are returned separately rather than merged, so the UI can
 * keep showing which is which — a link the student chose and a link the tool
 * suggested are not the same recommendation.
 */
export const getSkillResources = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const skillId = req.params.skillId;

  const saved = await SavedResource.find({
    userId: new Types.ObjectId(session.userId),
    skillId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ skillId, guide: guideFor(skillId), saved });
});

/** Everything the student has kept, newest first. */
export const listLibrary = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const saved = await SavedResource.find({ userId: new Types.ObjectId(session.userId) })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ saved });
});

export const saveResource = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as SavedResourceInput;

  try {
    const doc = await SavedResource.create({
      userId: new Types.ObjectId(session.userId),
      skillId: input.skillId,
      title: input.title,
      url: input.url,
      note: input.note,
      curated: input.curated,
    });
    res.status(201).json({ saved: doc.toObject() });
  } catch (error) {
    // The unique index doing its job, not a fault. Saying so beats a 409 with
    // no explanation when the student clicks save twice.
    if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
      throw new HttpError(409, "That link is already in your library for this skill");
    }
    throw error;
  }
});

export const deleteResource = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw notFound("No such saved link");

  const { deletedCount } = await SavedResource.deleteOne({
    _id: new Types.ObjectId(id),
    userId: new Types.ObjectId(session.userId),
  });
  if (deletedCount === 0) throw notFound("No such saved link");
  res.json({ deleted: true });
});
