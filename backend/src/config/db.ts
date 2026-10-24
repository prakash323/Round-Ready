import mongoose from "mongoose";
import { loadEnv } from "./env";

/**
 * The Mongoose connection.
 *
 * Cached on `globalThis` because `tsx watch` replaces the module registry on
 * every save; without the cache each edit opens a new connection pool and an
 * Atlas M0 cluster runs out of connections within a few minutes of editing.
 *
 * `strictQuery` is on so a filter naming a field the schema does not have is an
 * error rather than a query that silently matches everything — which, for a
 * codebase where every read is scoped by `batchId` and `userId`, is the
 * difference between a bug and a data leak.
 */

declare global {
  var __roundready_mongoose: Promise<typeof mongoose> | undefined;
}

mongoose.set("strictQuery", true);

export function connectDb(): Promise<typeof mongoose> {
  const env = loadEnv();
  if (!global.__roundready_mongoose) {
    global.__roundready_mongoose = mongoose
      .connect(env.mongoUri, {
        dbName: env.mongoDb,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
      })
      .catch((error: unknown) => {
        // Let the next attempt retry rather than caching a rejected promise for
        // the lifetime of the process.
        global.__roundready_mongoose = undefined;
        throw error;
      });
  }
  return global.__roundready_mongoose;
}

export async function disconnectDb(): Promise<void> {
  global.__roundready_mongoose = undefined;
  await mongoose.disconnect();
}
