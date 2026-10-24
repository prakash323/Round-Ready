import { buildBoard } from "../lib/engine";
import { boardToCalendarEvents } from "../lib/calendar";
import { buildCalendar } from "../lib/ics";
import { loadBoardInput } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";

/**
 * An .ics download of every round on drives the student can still act on.
 *
 * Deliberately not a subscription URL: that would need a bearer token in the
 * query string, which then lives in the calendar client's config and in server
 * logs forever. This is an authenticated download instead — a worse feature and
 * a much better trade.
 */
export const getCalendar = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = await loadBoardInput(session);
  const now = new Date();
  const board = buildBoard(input, now);

  const body = buildCalendar(boardToCalendarEvents(board, now), {
    name: `RoundReady — ${session.name}`,
    now,
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="roundready.ics"');
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
});
