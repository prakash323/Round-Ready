import type { ZodTypeAny, z } from "zod";
import type { RequestHandler } from "express";

/**
 * Run a Zod schema over the request body, before anything touches the database.
 *
 * Ordering matters: a malformed body is a 422 whether or not Mongo is
 * reachable, and validating first keeps a misconfigured deployment from
 * masking a client bug as a 503.
 *
 * The parsed value replaces `req.body`, so a handler cannot accidentally read
 * the raw input — and because Zod strips unknown keys, a `$set` built from it
 * cannot carry a field the schema never declared.
 */
export function validate(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/** The parsed body, typed by the schema that produced it. */
export type Parsed<S extends ZodTypeAny> = z.infer<S>;
