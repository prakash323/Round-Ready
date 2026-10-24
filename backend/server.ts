import { connectDb } from "./src/config/db";
import { loadEnv } from "./src/config/env";
import { createApp } from "./src/server";

/**
 * The entry point: load the environment, connect, listen.
 *
 * Connecting *before* listening is deliberate. A server that accepts requests
 * while the database is unreachable answers the first few with a timeout that
 * looks like a product bug; failing at boot with the variable named is a much
 * cheaper way to find out the URI is wrong.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  await connectDb();

  createApp().listen(env.port, () => {
    console.log(`RoundReady API listening on http://localhost:${env.port}`);
    console.log(`  database  ${env.mongoDb}`);
    console.log(`  cors      ${env.frontendUrl} (credentials allowed)`);
    console.log(`  cookie    SameSite=${env.isProduction ? "None; Secure" : "Lax"}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
