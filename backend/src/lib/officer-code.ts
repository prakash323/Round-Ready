import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "../config/env";

/**
 * The CDC officer registration code.
 *
 * This code is the whole of the authorisation to publish drives to a batch, so
 * it is handled like a password rather than like a setting:
 *
 *  - It is compared in constant time. A plain `===` leaks the length of the
 *    shared prefix through timing, which turns guessing it from brute force
 *    into a character-at-a-time walk.
 *  - It fails closed. If no code is configured, every claim is refused, so a
 *    deployment that forgets to set one has no officers rather than an open
 *    door.
 *  - It is never logged, echoed, or included in an error message.
 */

export function isOfficerCodeConfigured(): boolean {
  return loadEnv().officerCode !== null;
}

export function officerCodeMatches(supplied: string): boolean {
  const expected = loadEnv().officerCode;
  if (expected === null) return false;

  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // timing signal. Both sides are hashed to a fixed width first so that every
  // comparison costs the same regardless of what was supplied.
  if (a.length !== b.length) {
    const pad = Buffer.alloc(Math.max(a.length, b.length));
    const left = Buffer.alloc(pad.length);
    const right = Buffer.alloc(pad.length);
    a.copy(left);
    b.copy(right);
    timingSafeEqual(left, right);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * A fixed-window attempt limiter, in memory.
 *
 * Without this the code is guessable at the speed of the network, which makes
 * its length the only defence. In memory is the honest scope: it holds for a
 * single process, and a multi-instance deployment would need a shared store —
 * said here rather than discovered later.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function recordFailedOfficerAttempt(key: string, now: number = Date.now()): void {
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function officerAttemptsExhausted(key: string, now: number = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (now >= entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

/** Seconds until the window clears, for the Retry-After header. */
export function officerRetryAfterSeconds(key: string, now: number = Date.now()): number {
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) return 0;
  return Math.ceil((entry.resetAt - now) / 1000);
}

/** Test seam. The limiter is process-wide state, so tests must be able to clear it. */
export function resetOfficerAttempts(): void {
  attempts.clear();
}
