import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { loadEnv } from "../config/env";
import type { CookieOptions } from "express";
import type { SessionUser } from "./repo";

/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie. The token is signed rather than
 * encrypted — it carries an id, an email and a batch key, nothing secret — and
 * it is httpOnly so page scripts cannot read it. There is no refresh-token
 * dance: a student's placement season is eight weeks and a seven-day session is
 * the right trade for a single-purpose tool.
 */

export const COOKIE = "rr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const BCRYPT_ROUNDS = 12;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(loadEnv().authSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    batchId: user.batchId,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** The signed-in user, or null. Never throws on a bad or expired token. */
export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      batchId: String(payload.batchId ?? ""),
      // Anything unrecognised reads as a student. A token signed before roles
      // existed carries no claim at all, and the safe reading of "no claim" is
      // the role with no privileges.
      role: payload.role === "cdc_officer" ? "cdc_officer" : "student",
    };
  } catch {
    // Expired, tampered with, or signed by a previous AUTH_SECRET.
    return null;
  }
}

/**
 * Cookie options, which differ by environment for one unavoidable reason.
 *
 * In production the client and the API are on different sites, so the cookie
 * has to be `SameSite=None` — and browsers only accept that with `Secure`,
 * which means both deployments must be HTTPS. In development the Vite proxy
 * makes the app same-origin, so `Lax` works and nothing needs a certificate.
 */
export function cookieOptions(): CookieOptions {
  const { isProduction } = loadEnv();
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: MAX_AGE_SECONDS * 1000,
    path: "/",
  };
}

/** The same attributes, with the lifetime zeroed — a browser only drops a
 *  cookie when the clearing response matches its other attributes. */
export function clearedCookieOptions(): CookieOptions {
  return { ...cookieOptions(), maxAge: 0 };
}
