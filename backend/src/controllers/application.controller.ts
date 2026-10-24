import { Types } from "mongoose";
import { Application } from "../models/Application";
import { Drive } from "../models/Drive";
import { liveDriveFilter } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler, notFound } from "../middleware/errorHandler";
import type { ApplicationInput } from "../lib/schemas";

function objectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

export const listApplications = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const docs = await Application.find({ userId: new Types.ObjectId(session.userId) }).lean();
  res.json({ applications: docs });
});

/**
 * Record or advance an application.
 *
 * PUT rather than POST because the operation is idempotent per drive: the
 * unique index on `(userId, driveId)` means there is at most one application
 * per student per company, so "set my status for this drive" is the honest
 * description of what the route does.
 */
export const putApplication = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as ApplicationInput;

  const driveId = objectId(input.driveId);
  if (!driveId) throw notFound();

  const drive = await Drive.findOne({ _id: driveId, ...liveDriveFilter(session.batchId) }).lean();
  if (!drive) throw notFound();

  const userId = new Types.ObjectId(session.userId);
  const existing = await Application.findOne({ userId, driveId }).lean();
  const now = new Date();

  // An offer with no stated amount falls back to the advertised CTC, so the
  // policy gate still has a number to work with (PRD R13).
  const offerCtcLpa =
    input.status === "offer" ? (input.offerCtcLpa ?? drive.ctcLpa) : input.offerCtcLpa;

  // History is append-only, and a re-save of the same status does not add a
  // duplicate entry — "when did I apply?" must stay answerable.
  const appendHistory = existing?.status !== input.status;

  await Application.updateOne(
    { userId, driveId },
    {
      $set: {
        status: input.status,
        currentRound: input.currentRound,
        offerCtcLpa,
        updatedAt: now,
      },
      $setOnInsert: { userId, driveId },
      ...(appendHistory ? { $push: { history: { status: input.status, at: now } } } : {}),
    },
    { upsert: true },
  );

  res.json({ application: await Application.findOne({ userId, driveId }).lean() });
});

export const deleteApplication = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const driveId = objectId(String(req.query.driveId ?? ""));
  if (!driveId) throw notFound();

  const { deletedCount } = await Application.deleteOne({
    userId: new Types.ObjectId(session.userId),
    driveId,
  });
  res.json({ deleted: deletedCount === 1 });
});
