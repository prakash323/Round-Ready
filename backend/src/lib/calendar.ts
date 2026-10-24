import { counterpart, summariseEligibility } from "./engine";
import type { Board } from "./engine";
import type { CalendarEvent } from "./ics";

/**
 * The board, as calendar events.
 *
 * Pure, and separate from the controller, because the thing worth testing here
 * is which events come out and what identifies them — not the response headers.
 *
 * Only drives the student can still act on are exported. A company whose CGPA
 * cutoff they miss is not something they need a calendar reminder for.
 */
export function boardToCalendarEvents(board: Board, _now: Date = new Date()): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const view of [...board.actionable, ...board.unknown]) {
    const { drive, clashes } = view;

    for (const round of drive.rounds) {
      const conflicting = clashes
        .filter((c) => [c.a, c.b].some((r) => r.driveId === drive.id && r.roundId === round.id))
        .map((c) => counterpart(c, drive.id).company);

      const notes = [
        `${drive.role} · ${drive.ctcLpa} LPA`,
        summariseEligibility(view.eligibility),
        conflicting.length > 0 ? `Clashes with ${conflicting.join(", ")}` : null,
      ].filter(Boolean) as string[];

      events.push({
        // Keyed on the round's own id, never on its name. Two rounds both
        // called "Technical Interview" used to produce the same UID, and a
        // calendar client treats a repeated UID as an update to the first —
        // so one of the two interviews vanished (AUDIT.md D3).
        uid: `${drive.id}-${round.id}@roundready`,
        start: round.startAt,
        end: round.endAt,
        summary: `${drive.company} — ${round.name}`,
        description: notes.join(". "),
        location: drive.location ?? undefined,
      });
    }
  }

  return events;
}
