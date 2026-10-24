import { Types } from "mongoose";
import { Profile } from "../models/Profile";
import { User } from "../models/User";
import { batchKey } from "../lib/repo";
import {
  isOfficerCodeConfigured,
  officerAttemptsExhausted,
  officerCodeMatches,
  recordFailedOfficerAttempt,
} from "../lib/officer-code";
import {
  COOKIE,
  clearedCookieOptions,
  cookieOptions,
  hashPassword,
  signSession,
  verifyPassword,
} from "../lib/session";
import { HttpError, asyncHandler } from "../middleware/errorHandler";
import type { Role } from "../models/User";
import type { LoginInput, RegisterInput } from "../lib/schemas";

/**
 * Which role this registration gets.
 *
 * No code supplied means student, which is the overwhelming majority and
 * needs no configuration to work. A code supplied and wrong is an error, not a
 * silent downgrade: somebody who believes they are registering as the CDC
 * officer must not discover otherwise when the Add drive button is missing a
 * week later.
 *
 * The attempt limiter is keyed by IP and only counts *failures*, so a batch of
 * students registering normally can never exhaust it.
 */
async function roleForRegistration(req: { ip?: string; body: unknown }): Promise<Role> {
  const { officerCode } = req.body as RegisterInput;
  if (officerCode === null) return "student";

  const key = req.ip ?? "unknown";
  if (officerAttemptsExhausted(key)) {
    throw new HttpError(429, "Too many incorrect officer codes. Try again later.", {
      officerCode: "Too many attempts",
    });
  }

  if (!isOfficerCodeConfigured()) {
    // Fail closed, and say so plainly — this is a deployment that has not set
    // CDC_OFFICER_CODE, which the person registering cannot fix by retyping.
    recordFailedOfficerAttempt(key);
    throw new HttpError(403, "CDC officer registration is not enabled on this deployment", {
      officerCode: "Not enabled here",
    });
  }

  if (!officerCodeMatches(officerCode)) {
    recordFailedOfficerAttempt(key);
    throw new HttpError(403, "That CDC officer code is not correct", {
      officerCode: "Not correct",
    });
  }

  return "cdc_officer";
}

export const register = asyncHandler(async (req, res) => {
  const input = req.body as RegisterInput;

  // Resolved before the duplicate-email check so that a wrong code fails the
  // same way whether or not the email is already taken, which stops this route
  // from answering "does this address have an account" to anyone with a code.
  const role = await roleForRegistration(req);

  // Checked explicitly so the response is a readable 409 rather than relying on
  // the duplicate-key translation — but the unique index is still what makes it
  // safe under two simultaneous sign-ups.
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, "An account with that email already exists", {
      email: "Already registered",
    });
  }

  const userId = new Types.ObjectId();
  const batchId = batchKey(input.college, input.gradYear);

  await User.create({
    _id: userId,
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    college: input.college,
    gradYear: input.gradYear,
    batchId,
    role,
  });

  // An empty profile is created up front so the rest of the app can assume one
  // row per user and never branch on "profile missing".
  await Profile.create({ userId });

  const session = {
    userId: userId.toHexString(),
    email: input.email,
    name: input.name,
    batchId,
    role,
  };
  res.cookie(COOKIE, await signSession(session), cookieOptions());
  res.status(201).json({ user: { email: input.email, name: input.name, batchId, role } });
});

export const login = asyncHandler(async (req, res) => {
  const input = req.body as LoginInput;
  const user = await User.findOne({ email: input.email });

  // One message for both "no such email" and "wrong password". Distinguishing
  // them turns the login form into a tool for discovering who has an account.
  const INVALID = "Those details do not match an account";
  if (!user) throw new HttpError(401, INVALID);
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, INVALID);
  }

  const session = {
    userId: String(user._id),
    email: user.email,
    name: user.name,
    batchId: user.batchId,
    // Coalesced for the same reason as above: consistent whether the account
    // predates the field or not.
    role: user.role ?? "student",
  };
  res.cookie(COOKIE, await signSession(session), cookieOptions());
  res.json({
    user: { email: user.email, name: user.name, batchId: user.batchId, role: user.role ?? "student" },
  });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(COOKIE, clearedCookieOptions());
  res.json({ signedOut: true });
});

/**
 * Who am I? The client calls this on load to decide whether to show /login,
 * and which of the officer-only controls to render.
 *
 * The role is read from the database rather than from the token, for the same
 * reason `requireOfficer` does: a role that changed should show up at the next
 * page load, not at the next login. If the account has since been deleted the
 * answer is "nobody", which lands the client on /login rather than leaving it
 * rendering a session for a user that no longer exists.
 */
export const me = asyncHandler(async (req, res) => {
  const session = req.user ?? null;
  if (!session) {
    res.json({ user: null });
    return;
  }

  const current = await User.findById(session.userId)
    .select("role")
    .lean<{ role?: Role } | null>();
  if (!current) {
    res.json({ user: null });
    return;
  }

  res.json({
    user: {
      email: session.email,
      name: session.name,
      batchId: session.batchId,
      // Always present, even for an account that predates the field —
      // `.lean()` skips the schema default, and a client that receives no
      // role at all has to invent one.
      role: current.role ?? "student",
    },
  });
});
