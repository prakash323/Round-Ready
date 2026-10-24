import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { DaySummary } from "../lib/types";

/**
 * A month of study days.
 *
 * Days are plain `YYYY-MM-DD` strings from end to end — never Date objects.
 * A `Date` is an instant, and a task belongs to a calendar day: parse
 * "2026-10-25" into a Date and it becomes midnight UTC, which is half past
 * five on the 25th in IST, and a planner that does this shows Monday's work
 * on Sunday for every user east of Greenwich.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Which weekday a `YYYY-MM-DD` falls on, computed in UTC so it cannot drift. */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dayNumber(day: string): number {
  return Number(day.slice(8, 10));
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const cursor = new Date(Date.UTC(y, m - 1, 1));
  while (cursor.getUTCMonth() === m - 1) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({
  month,
  days,
  selected,
  today,
  onSelect,
  onMonthChange,
}: {
  month: string;
  days: Record<string, DaySummary>;
  selected: string;
  today: string;
  onSelect: (day: string) => void;
  onMonthChange: (month: string) => void;
}) {
  const monthDays = daysOfMonth(month);
  // Blank cells so the first of the month lands under the right weekday.
  const leadingBlanks = weekdayOf(monthDays[0]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-display text-base font-semibold sm:text-lg">{monthLabel(month)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="btn-quiet h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              onMonthChange(today.slice(0, 7));
              onSelect(today);
            }}
            className="btn-quiet btn-sm"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="Next month"
            className="btn-quiet h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-edge">
        <div className="grid grid-cols-7 border-b border-edge bg-canvas">
          {WEEKDAYS.map((name) => (
            <div
              key={name}
              className="px-1 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-faint"
            >
              {/* One letter on the narrowest screens, where three will not fit. */}
              <span className="hidden sm:inline">{name}</span>
              <span className="sm:hidden">{name[0]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} className="border-b border-r border-edge bg-canvas/40" />
          ))}

          {monthDays.map((day) => {
            const summary = days[day];
            const isSelected = day === selected;
            const isToday = day === today;
            const complete = summary !== undefined && summary.total > 0 && summary.done === summary.total;

            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelect(day)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${day}${summary ? `, ${summary.done} of ${summary.total} tasks done` : ", no tasks"}`}
                className={`relative min-h-[4.25rem] border-b border-r border-edge p-1.5 text-left transition-colors sm:min-h-[5.5rem] ${
                  isSelected
                    ? "bg-accent/10 ring-2 ring-inset ring-accent"
                    : complete
                      ? "bg-ok/[0.07] hover:bg-ok/[0.12]"
                      : "hover:bg-edge/30"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`tabular text-xs font-medium ${
                      isToday
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-2xs text-accent-ink"
                        : ""
                    }`}
                  >
                    {dayNumber(day)}
                  </span>
                  {summary && summary.total > 0 && (
                    <span className="tabular text-2xs font-semibold text-accent">
                      {summary.total}
                    </span>
                  )}
                </div>

                {summary && summary.total > 0 && (
                  <div className="mt-1">
                    {complete ? (
                      <span className="flex items-center gap-0.5 text-2xs font-medium text-ok">
                        <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Done
                      </span>
                    ) : (
                      <>
                        {/* A bar rather than only a number: on a month grid the
                            shape is readable at a glance and the figure is not. */}
                        <div className="h-1 w-full overflow-hidden rounded-full bg-edge">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${summary.percent}%` }}
                          />
                        </div>
                        <span className="mt-0.5 block text-2xs text-faint">
                          {summary.percent}%
                        </span>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
