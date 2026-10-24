/**
 * Job-description analysis.
 *
 * Pure functions over text: no clock, no database, no network. The same
 * constraint the placement engine is built on, and for the same reason — it
 * makes the cases cheap enough to write exhaustively.
 */
export * from "./taxonomy";
export * from "./analyze";
export * from "./gap";
export * from "./plan";
export * from "./resources";
