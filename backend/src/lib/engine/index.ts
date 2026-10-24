/**
 * The RoundReady decision engine.
 *
 * Four calculations and one composition, all pure:
 *
 *   eligibility  — does this student clear the drive's stated cutoffs, and if
 *                  not, exactly which ones
 *   policy       — does the college's placement rule allow them to sit for it,
 *                  given what they have already accepted
 *   clash        — do its rounds collide with another live drive's
 *   priority     — of the drives they can act on, which deserves the next four
 *                  hours, and why
 *   board        — the three verdicts composed into the view they read
 *   simulate     — the board rebuilt against a hypothetical accepted offer, so
 *                  the cost of saying yes is visible before they say it
 *
 * Nothing in here imports a database client, a React component or the current
 * time from ambient scope. That constraint is what makes the ~90 cases in
 * `src/tests` cheap to write and fast to run.
 */

export * from "./types";
export * from "./eligibility";
export * from "./policy";
export * from "./clash";
export * from "./priority";
export * from "./board";
export * from "./simulate";
