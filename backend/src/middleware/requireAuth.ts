import { COOKIE, readSession } from "../lib/session";
import { User } from "../models/User";
import { HttpError, asyncHandler, unauthorised } from "./errorHandler";
import type { RequestHandler } from "express";
import type { SessionUser } from "../lib/repo";
import type { Role } from "../models/User";

/**
 * Authorisation, checked per route rather than globally.
 *
 * Every route that reads or writes a student's data mounts this, and the
 * session it produces is the only source of `userId` and `batchId` anywhere
 * downstream — no handler reads either from the request body, so a client
 * cannot ask for someone else's board by saying so.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const session = await readSession(req.cookies?.[COOKIE]);
  if (!session) throw unauthorised();
  req.user = session;
  next();
});

/** The session on a route that has already run `requireAuth`. */
export function sessionOf(req: { user?: SessionUser }): SessionUser {
  if (!req.user) throw unauthorised();
  return req.user;
}

/**
 * The CDC officer gate, for the routes that publish to a whole batch.
 *
 * The role is read back from the database rather than taken from the token.
 * The token is signed, so this is not about forgery — it is about staleness:
 * a session lasts seven days, and an officer who leaves the role should lose
 * the ability to publish drives at the next request, not at the next login.
 * One indexed read on the handful of write routes is a fair price for that.
 *
 * Students get 403 rather than 404 here, unlike a drive from another college.
 * Nothing is being concealed: the route is public knowledge, the student is
 * simply not the one who may use it, and saying so is more useful than
 * pretending the endpoint does not exist.
 */
export const requireOfficer: RequestHandler = asyncHandler(async (req, _res, next) => {
  const session = sessionOf(req);
  const user = await User.findById(session.userId)
    .select("role")
    .lean<{ role?: Role } | null>();
  if (!user) throw unauthorised();
  // `.lean()` skips hydration, so the schema's default never runs: an account
  // created before the field existed comes back with no `role` at all. The
  // safe reading of "no role recorded" is the one with no privileges, and
  // saying so here beats `user.role !== "cdc_officer"` happening to be right.
  if ((user.role ?? "student") !== "cdc_officer") {
    throw new HttpError(403, "Only a CDC officer can publish or change drives for a batch");
  }
  next();
});
