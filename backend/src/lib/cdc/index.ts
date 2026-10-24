/**
 * The CDC portal import.
 *
 * Pure throughout: an envelope the student pasted in, a list of drives they
 * already have, and a plan describing what would change. No network calls, no
 * database, no portal credentials — see `types.ts` for why that is the only
 * shape this integration could take.
 */
export * from "./types";
export * from "./parse";
export * from "./adapter";
export * from "./plan";
