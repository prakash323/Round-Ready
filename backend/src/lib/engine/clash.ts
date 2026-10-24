import { ABANDONED_STATUSES, MS_PER_MINUTE } from "./types";
import type { Application, Drive, Round } from "./types";

/**
 * Scheduling clash detection (PRD rules R11–R13).
 *
 * The whole correctness of this module is one comparison. A test from 10:00 to
 * 11:00 and one from 11:00 to 12:00 are back to back, not in conflict. Using
 * closed intervals (`<=` / `>=`) flags every adjacent pair, and a tool that
 * cries wolf on every back-to-back slot gets ignored within a day. So the
 * interval is half-open: [start, end).
 */

export interface RoundRef {
  driveId: string;
  company: string;
  /** Identifies the round itself, where `roundName` only labels it (D3). */
  roundId: string;
  roundName: string;
  startAt: Date;
  endAt: Date;
}

export interface Clash {
  a: RoundRef;
  b: RoundRef;
  overlapMinutes: number;
}

/** Half-open overlap: touching windows do not overlap. */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export function overlapMinutes(a: RoundRef, b: RoundRef): number {
  const start = Math.max(a.startAt.getTime(), b.startAt.getTime());
  const end = Math.min(a.endAt.getTime(), b.endAt.getTime());
  return Math.max(0, Math.round((end - start) / MS_PER_MINUTE));
}

function toRefs(drive: Drive): RoundRef[] {
  return drive.rounds.map((r: Round) => ({
    driveId: drive.id,
    company: drive.company,
    roundId: r.id,
    roundName: r.name,
    startAt: r.startAt,
    endAt: r.endAt,
  }));
}

/**
 * Every pair of overlapping rounds across all drives the student is still in.
 *
 * Rounds are sorted by start time so the inner loop can stop as soon as a
 * candidate starts at or after the current round's end: with a sorted list,
 * nothing later can overlap either.
 */
export function findClashes(drives: Drive[], applications: Application[]): Clash[] {
  const abandoned = new Set(
    applications.filter((a) => ABANDONED_STATUSES.includes(a.status)).map((a) => a.driveId),
  );

  const refs = drives
    .filter((d) => !abandoned.has(d.id))
    .flatMap(toRefs)
    .sort((x, y) => x.startAt.getTime() - y.startAt.getTime());

  const clashes: Clash[] = [];
  for (let i = 0; i < refs.length; i += 1) {
    const a = refs[i];
    for (let j = i + 1; j < refs.length; j += 1) {
      const b = refs[j];
      if (b.startAt.getTime() >= a.endAt.getTime()) break;
      // Two rounds of the same drive are sequential stages, not a conflict.
      if (a.driveId === b.driveId) continue;
      if (overlaps(a.startAt, a.endAt, b.startAt, b.endAt)) {
        clashes.push({ a, b, overlapMinutes: overlapMinutes(a, b) });
      }
    }
  }
  return clashes;
}

/** Clashes indexed by drive, so both sides of a conflict can show it (R13). */
export function clashesByDrive(clashes: Clash[]): Map<string, Clash[]> {
  const map = new Map<string, Clash[]>();
  const push = (driveId: string, clash: Clash) => {
    const list = map.get(driveId);
    if (list) list.push(clash);
    else map.set(driveId, [clash]);
  };
  for (const clash of clashes) {
    push(clash.a.driveId, clash);
    push(clash.b.driveId, clash);
  }
  return map;
}

/** The other side of a clash, from one drive's point of view. */
export function counterpart(clash: Clash, driveId: string): RoundRef {
  return clash.a.driveId === driveId ? clash.b : clash.a;
}

/** The side of a clash belonging to this drive. */
export function ownSide(clash: Clash, driveId: string): RoundRef {
  return clash.a.driveId === driveId ? clash.a : clash.b;
}
