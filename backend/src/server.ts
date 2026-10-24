import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { loadEnv } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import type { Express } from "express";

/**
 * Builds the Express app without listening, so a test can import it.
 * `../server.ts` is the thin entry that loads the environment, connects to
 * Mongo and calls `listen`.
 */
export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  // Behind Render's proxy, `secure` cookies need the app to know the original
  // request was HTTPS, or Express refuses to set them.
  if (env.isProduction) app.set("trust proxy", 1);

  // `credentials: true` with an exact origin, never a wildcard: the browser
  // refuses to send a credentialed request to `*`, and the session cookie is
  // the only way this API identifies anybody.
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  app.use("/api", routes);

  // Unmatched /api paths answer in the same error shape as everything else,
  // rather than Express's HTML 404 page.
  app.use("/api", notFoundHandler);

  // Last in the chain.
  app.use(errorHandler);

  return app;
}
