import { Types } from "mongoose";
import { Profile } from "../models/Profile";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import type { ProfileInput } from "../lib/schemas";

export const getProfile = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const doc = await Profile.findOne({ userId: new Types.ObjectId(session.userId) }).lean();
  res.json({ profile: doc });
});

export const putProfile = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as ProfileInput;
  const userId = new Types.ObjectId(session.userId);

  // Upsert rather than update: a profile row is created at registration, but a
  // seeded or migrated account might not have one, and the student should not
  // see a 404 for their own profile.
  const doc = await Profile.findOneAndUpdate(
    { userId },
    { $set: { ...input }, $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  // Nothing derived is written back. Changing the CGPA here re-evaluates every
  // drive on the next board read, with no fan-out update to go wrong.
  res.json({ profile: doc });
});
