import { simulateAccept } from "../lib/engine";
import { loadBoardInput } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { HttpError, asyncHandler } from "../middleware/errorHandler";
import type { SimulateInput } from "../lib/schemas";

/**
 * "What does accepting this offer cost me?"
 *
 * A read-only POST: the body carries the hypothesis, and nothing is written.
 * The simulation builds the board twice in memory — once as things stand, once
 * with the offer accepted — and returns the difference. Because the board is
 * derived rather than stored, there is no transaction to roll back and no way
 * for a hypothetical to leak into the student's real data (PRD R24).
 */
export const postSimulate = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const input = req.body as SimulateInput;
  const boardInput = await loadBoardInput(session);

  if (!boardInput.drives.some((d) => d.id === input.driveId)) {
    throw new HttpError(404, "No such drive");
  }

  const simulation = simulateAccept(
    boardInput,
    input.driveId,
    input.offerCtcLpa ?? undefined,
    new Date(),
  );
  res.json({ simulation });
});
