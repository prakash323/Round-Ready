/**
 * The planner's arithmetic: per-day progress, and the study streak.
 *
 * Pure, and working in calendar days rather than instants throughout. A study
 * task belongs to a day, not to a moment — the student decides "Tuesday", not
 * "Tuesday 00:00 UTC". Treating days as Dates is how a planner shows Monday's
 * work on Sunday for everybody east of Greenwich, which is most of its users.
 */

export interface PlannerTask {
  id: string;
  scheduledOn: string;
  durationMinutes: number;
  completedAt: Date | null;
}

export interface DaySummary {
  /** YYYY-MM-DD */
  day: string;
  total: number;
  done: number;
  /** Whole percent, 0 when the day is empty — never NaN. */
  percent: number;
  minutes: number;
  doneMinutes: number;
}

/** The Indian Standard Time offset, which is what the whole app displays in. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * The calendar day an instant falls on, in IST.
 *
 * Done by shifting then reading UTC parts rather than with `toLocaleDateString`,
 * so the result does not depend on the server's own timezone — a planner whose
 * streak changes when the API is redeployed to a different region is not a
 * planner anyone can trust.
 */
export function dayKeyOf(instant: Date, offsetMinutes: number = IST_OFFSET_MINUTES): string {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The day `delta` days away from a YYYY-MM-DD key, as another key. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  // Built in UTC so the arithmetic cannot be bent by a local DST transition.
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  return dayKeyOf(base, 0);
}

/** Every day in a month, as keys. `month` is YYYY-MM. */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const cursor = new Date(Date.UTC(y, m - 1, 1));
  while (cursor.getUTCMonth() === m - 1) {
    out.push(dayKeyOf(cursor, 0));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Per-day totals for a set of tasks.
 *
 * Completed tasks still count towards the day's total. Dropping them would
 * make a day the student finished look empty, and the percentage would read
 * 0% precisely when it should read 100%.
 */
export function summariseDays(tasks: PlannerTask[]): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>();
  for (const task of tasks) {
    const existing = out.get(task.scheduledOn) ?? {
      day: task.scheduledOn,
      total: 0,
      done: 0,
      percent: 0,
      minutes: 0,
      doneMinutes: 0,
    };
    existing.total += 1;
    existing.minutes += task.durationMinutes;
    if (task.completedAt !== null) {
      existing.done += 1;
      existing.doneMinutes += task.durationMinutes;
    }
    out.set(task.scheduledOn, existing);
  }
  for (const summary of out.values()) {
    summary.percent = summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100);
  }
  return out;
}

export interface Streak {
  /** Consecutive days up to and including today (or yesterday) with work done. */
  current: number;
  longest: number;
  /** The day the streak last had activity, or null. */
  lastActiveDay: string | null;
}

/**
 * The study streak.
 *
 * Counted from days on which a task was actually *completed*, not from days
 * that merely had tasks scheduled. A streak that rewards planning rather than
 * doing is a streak that rewards nothing.
 *
 * Today not yet having any completed work does not break the streak — the day
 * is still in progress, and a counter that resets at midnight and reappears
 * after the evening's first task would be noise. Yesterday with nothing does
 * break it.
 *
 * A student with no completed work has a streak of zero. There is no starting
 * bonus: inventing a streak for someone who has done nothing is the kind of
 * cheerful lie that makes every other number on the page suspect.
 */
export function studyStreak(tasks: PlannerTask[], now: Date): Streak {
  const activeDays = new Set<string>();
  for (const task of tasks) {
    if (task.completedAt !== null) activeDays.add(dayKeyOf(task.completedAt));
  }
  if (activeDays.size === 0) return { current: 0, longest: 0, lastActiveDay: null };

  const sorted = [...activeDays].sort();
  const lastActiveDay = sorted[sorted.length - 1];

  // Longest run anywhere in the history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    run = shiftDay(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // The current run counts back from today, or from yesterday when today has
  // not been worked yet.
  const today = dayKeyOf(now);
  const yesterday = shiftDay(today, -1);
  let cursor = activeDays.has(today) ? today : activeDays.has(yesterday) ? yesterday : null;
  if (cursor === null) return { current: 0, longest, lastActiveDay };

  let current = 0;
  while (activeDays.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  return { current, longest, lastActiveDay };
}
