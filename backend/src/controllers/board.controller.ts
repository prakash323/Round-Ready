import { agenda, buildBoard } from "../lib/engine";
import { loadBoardInput, loadDriveAuthors, profileIsUsable } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import type { DriveView } from "../lib/engine";

/**
 * The whole board, computed on demand.
 *
 * There is no cache and no stored projection. Three collection reads and a pure
 * function is fast enough for a season's worth of drives, and it means the
 * answer can never be stale — which, for a tool whose job is to say "you are
 * eligible for this", is the only acceptable guarantee.
 */
export const getBoard = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = await loadBoardInput(session);
  const now = new Date();
  const board = buildBoard(input, now);

  // The author is attached here rather than carried on the engine's `Drive`
  // type: it is a display label, not an input to any verdict, and widening the
  // domain type for it would mean the engine knew about users (AUDIT.md D2).
  const authors = await loadDriveAuthors(session.batchId, session.userId);
  const withAuthor = (view: DriveView) => ({
    ...view,
    createdByName: authors.get(view.drive.id) ?? null,
  });

  res.json({
    stats: board.stats,
    clashes: board.clashes,
    policyWarning: board.policyWarning,
    profileIsUsable: profileIsUsable(input.profile),
    policy: input.profile.policy,
    dreamCtcLpa: input.profile.dreamCtcLpa,
    // Surfaced at board level so the dashboard and the simulator can explain
    // the bar without re-deriving it from a drive that happens to be blocked.
    // Read off the board rather than recomputed. Deriving it here a second
    // time meant this summary quietly ignored the batch's own multipliers —
    // the headline said 1.5× while every verdict below it used the officer's
    // 1.75×, and nothing in either number admitted the disagreement.
    securedPlacement: input.profile.securedPlacement,
    securedThresholdLpa: board.securedGate?.thresholdLpa ?? null,
    securedMultiplier: board.securedGate?.multiplier ?? null,
    agenda: agenda(board, 7, now),
    groups: {
      actionable: board.actionable.map(withAuthor),
      unknown: board.unknown.map(withAuthor),
      blocked: board.blocked.map(withAuthor),
      notEligible: board.notEligible.map(withAuthor),
      expired: board.expired.map(withAuthor),
      resolved: board.resolved.map(withAuthor),
    },
  });
});

/** The six-week agenda the calendar page reads. */
export const getAgenda = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = await loadBoardInput(session);
  const now = new Date();
  const board = buildBoard(input, now);
  const days = Math.min(180, Math.max(1, Number(req.query.days ?? 42)));
  res.json({ agenda: agenda(board, days, now), clashes: board.clashes });
});
