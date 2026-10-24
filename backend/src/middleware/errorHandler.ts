import { ZodError } from "zod";
import { fieldErrors } from "../lib/schemas";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

/**
 * One error shape for every route, so the client has one thing to render:
 *
 *   { "error": { "message": "...", "fields": { "cgpa": "must be ..." } } }
 *
 * `fields` is present only for validation failures. Internal error details are
 * logged server-side and never returned — a stack trace in a response body is
 * both a poor user experience and an information leak.
 */

export interface ApiError {
  error: { message: string; fields?: Record<string, string> };
}

/** A failure the client is allowed to be told about, with a chosen status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorised = () => new HttpError(401, "Sign in to continue");
export const notFound = (what = "No such drive") => new HttpError(404, what);

/**
 * Wrap an async handler so a rejected promise reaches the error handler.
 *
 * Express 4 does not forward rejections from an async function on its own: the
 * rejection becomes an unhandled promise and the request hangs until it times
 * out. This is the same job the Next.js version's `route()` helper did.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * `express.json()` rejects an unparseable body with a `SyntaxError` carrying
 * the raw body and `type: "entity.parse.failed"`. Left unhandled it becomes a
 * 500 with a logged stack trace — reporting a client's malformed request as a
 * fault on our side, and filling the logs with it.
 */
function bodyParserStatus(error: unknown): { status: number; message: string } | null {
  if (typeof error !== "object" || error === null || !("type" in error)) return null;
  const type = (error as { type?: unknown }).type;
  if (type === "entity.parse.failed") {
    return { status: 400, message: "Request body must be valid JSON" };
  }
  if (type === "entity.too.large") {
    return { status: 413, message: "That request is too large" };
  }
  return null;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Last in the chain. Nothing after this needs to know about error shapes. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    const body: ApiError = {
      error: error.fields ? { message: error.message, fields: error.fields } : { message: error.message },
    };
    res.status(error.status).json(body);
    return;
  }

  const parseFailure = bodyParserStatus(error);
  if (parseFailure) {
    res.status(parseFailure.status).json({
      error: { message: parseFailure.message },
    } satisfies ApiError);
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: { message: "Some fields need fixing", fields: fieldErrors(error) },
    } satisfies ApiError);
    return;
  }

  // The unique indexes doing their job — a second application for the same
  // drive, or a second account on one email — not a server fault.
  if (isDuplicateKey(error)) {
    res.status(409).json({ error: { message: "That already exists" } } satisfies ApiError);
    return;
  }

  if (error instanceof Error && error.message.startsWith("Cannot start RoundReady")) {
    res.status(503).json({
      error: { message: "The database is not configured on this deployment" },
    } satisfies ApiError);
    return;
  }

  console.error("[error]", error);
  res.status(500).json({
    error: { message: "Something went wrong on our side" },
  } satisfies ApiError);
};

/** A 404 for any unmatched /api path, in the same shape as every other error. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: "No such endpoint" } } satisfies ApiError);
};
