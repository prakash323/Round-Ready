import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Environment, read once and validated loudly.
 *
 * A misconfigured deployment should fail at boot with a sentence naming the
 * variable, not three requests later with a connection timeout that looks like
 * a database problem. So the required values are checked here and the process
 * refuses to start without them.
 *
 * The `.env` parsing is hand-rolled rather than pulled from a dependency: it is
 * four lines, `tsx watch` does not load the file on its own, and
 * `node --env-file` is not reliably available through every runner.
 */

function loadDotEnv(file: string): void {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      // A real environment variable always wins over the file, so production
      // configuration cannot be shadowed by a stray .env left in the image.
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No such file. The checks below report anything actually missing.
  }
}

export interface Env {
  mongoUri: string;
  mongoDb: string;
  authSecret: string;
  port: number;
  frontendUrl: string;
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  /**
   * The code that grants the CDC officer role at registration, or null.
   *
   * Null means nobody can claim the role — the check fails closed rather than
   * open, so a deployment that forgets to set this ends up with no officers
   * rather than with every registration becoming one.
   */
  officerCode: string | null;
}

let cached: Env | null = null;

/**
 * Drop the memoised environment.
 *
 * Only for tests, which need to see what a *different* configuration does —
 * chiefly a deployment with no officer code, where the role check has to fail
 * closed. Without this the first `loadEnv` of the process would decide that
 * for every later case.
 */
export function resetEnvForTests(): void {
  cached = null;
}

export function loadEnv(): Env {
  if (cached) return cached;

  loadDotEnv(".env");
  loadDotEnv(".env.local");

  const problems: string[] = [];

  const mongoUri = process.env.MONGODB_URI ?? "";
  if (!mongoUri) {
    problems.push("MONGODB_URI is not set. Copy backend/.env.example to backend/.env.");
  }

  const authSecret = process.env.AUTH_SECRET ?? "";
  if (authSecret.length < 32) {
    problems.push(
      "AUTH_SECRET must be set to at least 32 characters. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }

  const nodeEnv = (process.env.NODE_ENV ?? "development") as Env["nodeEnv"];
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  // A short code is worse than none: it is the whole of the authorisation to
  // publish drives to an entire batch, so a guessable one is refused at boot
  // rather than quietly accepted. The value itself is never echoed.
  const officerCode = (process.env.CDC_OFFICER_CODE ?? "").trim() || null;
  if (officerCode !== null && officerCode.length < 12) {
    problems.push(
      "CDC_OFFICER_CODE must be at least 12 characters. It is the only thing standing " +
        "between a registration and the ability to publish drives to a whole batch.",
    );
  }

  // A credentialed cross-origin cookie cannot be sent to a wildcard origin, and
  // in production it also cannot be sent over plain http. Both are silent
  // failures at request time, so they are refused at boot instead.
  if (nodeEnv === "production") {
    if (frontendUrl === "*") {
      problems.push("FRONTEND_URL cannot be '*': CORS forbids a wildcard origin with credentials.");
    } else if (!frontendUrl.startsWith("https://")) {
      problems.push(
        `FRONTEND_URL must be https in production (got "${frontendUrl}"). The session cookie ` +
          "uses SameSite=None, which browsers only accept with Secure, which requires HTTPS.",
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Cannot start RoundReady:\n  - ${problems.join("\n  - ")}`);
  }

  cached = {
    mongoUri,
    mongoDb: process.env.MONGODB_DB ?? "roundready",
    authSecret,
    port: Number(process.env.PORT ?? 5001),
    frontendUrl,
    nodeEnv,
    isProduction: nodeEnv === "production",
    officerCode,
  };
  return cached;
}
