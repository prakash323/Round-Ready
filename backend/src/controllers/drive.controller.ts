import { Types } from "mongoose";
import { Application } from "../models/Application";
import { Drive } from "../models/Drive";
import { liveDriveFilter } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { HttpError, asyncHandler, notFound } from "../middleware/errorHandler";
import type { DriveInput } from "../lib/schemas";

function objectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

/** A company name is user input and goes into a RegExp, so "C++" must not
 *  become a quantifier. Escaped rather than trusted. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listDrives = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  // Scoped to the batch: thirty students in one year share one drive list, and
  // the eligibility criteria on a notice are identical for all of them.
  const docs = await Drive.find(liveDriveFilter(session.batchId, session.userId))
    .sort({ applicationDeadline: 1 })
    .populate<{ createdBy: { name: string } | null }>("createdBy", "name")
    .lean();
  res.json({ drives: docs });
});

export const getDrive = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound();

  const doc = await Drive.findOne({ _id: id, ...liveDriveFilter(session.batchId, session.userId) })
    .populate<{ createdBy: { name: string } | null }>("createdBy", "name")
    .lean();

  // A drive from another college returns 404, not 403: a 403 would confirm that
  // the id exists and is worth guessing at.
  if (!doc) throw notFound();
  res.json({ drive: doc });
});

/**
 * Publishing a drive to the batch.
 *
 * The duplicate check is new work rather than defensive habit: a double-tapped
 * submit, or a second officer adding a notice that is already up, puts two
 * identical cards in front of three hundred students, and the one they apply
 * through is then a coin toss. Matched on company and role, case-insensitively
 * and among live drives only, so re-adding a withdrawn notice still works.
 *
 * It is a 409 with the existing id, not a silent merge: the officer may well
 * have meant to post a second role at the same company, and only they can say.
 */
export const createDrive = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as DriveInput;

  // Published notices only. A classmate's private CDC import of the same
  // company must not stop an officer publishing it to the batch.
  const existing = await Drive.findOne({
    ...publishedDriveFilter(session.batchId),
    company: new RegExp(`^${escapeRegex(input.company)}$`, "i"),
    role: new RegExp(`^${escapeRegex(input.role)}$`, "i"),
  })
    .select("_id company role")
    .lean();

  if (existing) {
    throw new HttpError(409, `${existing.company} — ${existing.role} is already on the board`, {
      company: "This company and role are already posted",
    });
  }

  const doc = await Drive.create({
    ...input,
    batchId: session.batchId,
    createdBy: new Types.ObjectId(session.userId),
  });

  res.status(201).json({ drive: doc.toObject() });
});

/**
 * Who may change this particular drive.
 *
 * Two different things wear the same shape. A published notice belongs to the
 * batch and only its CDC officer may change it. A drive imported from a
 * student's own portal account belongs to that student, and they must be able
 * to correct it — Decision 4 turns on exactly that, since the portal sends no
 * CGPA or branch rule and the student is the one who can read the official
 * notice and type it in.
 *
 * Resolved from the stored document rather than from anything the request
 * says, and a drive outside the student's visibility is a 404 rather than a
 * 403, so the id of a classmate's private import cannot be confirmed by
 * probing for it.
 */
async function drivePermittedToWrite(
  session: { userId: string; batchId: string; role: string },
  id: Types.ObjectId,
): Promise<{ ownerId: Types.ObjectId | null }> {
  const doc = await Drive.findOne({ _id: id, ...liveDriveFilter(session.batchId, session.userId) })
    .select("ownerId")
    .lean<{ ownerId: Types.ObjectId | null } | null>();

  if (!doc) throw notFound();

  const owner = doc.ownerId ?? null;
  if (owner !== null) {
    if (owner.toHexString() !== session.userId) throw notFound();
    return { ownerId: owner };
  }

  // A published notice. The role is re-read from the database by
  // `requireOfficer` on the routes that need it, but this is the check that
  // decides, because only here is it known which kind of drive this is.
  const user = await User.findById(session.userId).select("role").lean<{ role?: string } | null>();
  if ((user?.role ?? "student") !== "cdc_officer") {
    throw new HttpError(403, "Only a CDC officer can change a drive published to the batch");
  }
  return { ownerId: null };
}

export const patchDrive = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound();

  await drivePermittedToWrite(session, id);

  const input = req.body as DriveInput;
  const doc = await Drive.findOneAndUpdate(
    { _id: id, ...liveDriveFilter(session.batchId, session.userId) },
    {
      $set: {
        ...input,
        // An edit by hand is the student's own statement about the drive, and
        // must outrank whatever a later sync brings back. Marking it here is
        // what stops the next import quietly reinstating "unknown".
        criteriaSource: "manual",
      },
    },
    { new: true },
  ).lean();

  if (!doc) throw notFound();
  res.json({ drive: doc });
});

/**
 * Withdrawing a drive — a soft delete (AUDIT.md D1).
 *
 * A drive is shared, and other students' applications reference it. Destroying
 * the row left every classmate holding an application that pointed at nothing,
 * which the policy gate then valued at zero CTC and used to block their entire
 * board — attributed to a company with no card on it to explain why.
 *
 * So the row is flagged rather than removed, and every read filters it out.
 *
 * No application is deleted. This used to clear the deleting *student's* own
 * row, which made sense when students removed their own drives; now that only
 * a CDC officer can, the same code would have an officer destroying records
 * belonging to people whose season it documents. A student's application is
 * their own history — that they applied, got to the final round, hold an
 * offer — and none of that stops being true because the notice came down.
 * `activeOffers` already handles the dangling reference, and the count is
 * reported so the officer can see how many students this touches.
 */
export const deleteDrive = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound();

  const doc = await Drive.findOneAndUpdate(
    { _id: id, ...liveDriveFilter(session.batchId, session.userId) },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();

  if (!doc) throw notFound();

  const applicationsAffected = await Application.countDocuments({ driveId: id });

  res.json({ deleted: true, applicationsAffected });
});
