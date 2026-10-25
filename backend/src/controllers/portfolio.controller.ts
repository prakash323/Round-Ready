import { Types } from "mongoose";
import { Portfolio, emptyPortfolio } from "../models/Portfolio";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import type { PortfolioInput } from "../lib/schemas";

/**
 * The student's portfolio: education, experience, projects, certificates and
 * coding-platform links.
 *
 * Private to its owner. Every query is scoped by `userId`, and there is no
 * route that reads anyone else's — a portfolio holds a phone number and a
 * home city, and nothing in RoundReady needs to show those to a classmate.
 */

export const getPortfolio = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const doc = await Portfolio.findOne({ userId: new Types.ObjectId(session.userId) }).lean();

  // An empty portfolio rather than null, so the client never branches on
  // "missing" and a student who has added nothing needs no migration.
  res.json({ portfolio: doc ?? emptyPortfolio() });
});

export const putPortfolio = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as PortfolioInput;

  const doc = await Portfolio.findOneAndUpdate(
    { userId: new Types.ObjectId(session.userId) },
    { $set: { ...input } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  res.json({ portfolio: doc });
});
