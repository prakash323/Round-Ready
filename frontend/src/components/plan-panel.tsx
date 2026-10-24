import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Clock3, Info, Search } from "lucide-react";
import { get, send } from "../lib/api";
import { formatIstDate, relativeToNow } from "../lib/format";
import { ErrorNote, Panel } from "./ui";
import type { PlanResponse, PlanSettings, PlanTask } from "../lib/types";

/**
 * The study plan.
 *
 * Derived server-side on every read, so this component never schedules
 * anything itself — it posts the three inputs (hours a day, the deadline, the
 * tick list) and renders what comes back. A second scheduler in the browser
 * would be free to disagree with the first.
 *
 * Ticking a task writes only its id. Completion is stored outside the plan,
 * which is why changing the deadline reshapes the schedule without losing an
 * evening's work.
 */

function TaskRow({
  task,
  onToggle,
  busy,
}: {
  task: PlanTask;
  onToggle: (task: PlanTask) => void;
  busy: boolean;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        id={`task-${task.id}`}
        checked={task.done}
        disabled={busy}
        onChange={() => onToggle(task)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-edge accent-accent"
      />
      <label htmlFor={`task-${task.id}`} className="min-w-0 flex-1 cursor-pointer">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm font-medium ${task.done ? "text-faint line-through" : ""}`}
          >
            {task.label}
          </span>
          {task.kind === "assess" ? (
            <span className="chip bg-info/12 text-info">
              <Search className="h-3 w-3" aria-hidden="true" />
              Assess
            </span>
          ) : task.importance === "required" ? (
            <span className="chip bg-edge/60 text-muted">Required</span>
          ) : (
            <span className="chip bg-edge/40 text-faint">Preferred</span>
          )}
          <span className="tabular text-2xs text-faint">
            {task.hours} {task.hours === 1 ? "hour" : "hours"}
          </span>
        </span>
        <span
          className={`mt-0.5 block text-xs leading-relaxed ${task.done ? "text-faint" : "text-muted"}`}
        >
          {task.objective}
        </span>
      </label>
    </li>
  );
}

export function PlanPanel({ jobDescriptionId }: { jobDescriptionId: string }) {
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: result, failure } = await get<PlanResponse>(
      `/api/jd/${jobDescriptionId}/plan`,
    );
    if (failure || !result) {
      setError(failure?.message ?? "The study plan could not be loaded.");
      return;
    }
    setData(result);
  }, [jobDescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (settings: PlanSettings) => {
      setBusy(true);
      setError(null);
      const { failure } = await send<{ settings: PlanSettings }>(
        `/api/jd/${jobDescriptionId}/plan`,
        "PATCH",
        {
          hoursPerDay: settings.hoursPerDay,
          deadline: settings.deadline,
          completedTaskIds: settings.completedTaskIds,
        },
      );
      if (failure) {
        setError(failure.message);
        setBusy(false);
        return;
      }
      await load();
      setBusy(false);
    },
    [jobDescriptionId, load],
  );

  if (error) return <ErrorNote message={error} />;

  if (!data) {
    return (
      <Panel title="Study plan">
        <div className="space-y-2" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Building your study plan</span>
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-16 w-full" />
        </div>
      </Panel>
    );
  }

  const { plan, settings } = data;

  function toggle(task: PlanTask) {
    const next = task.done
      ? settings.completedTaskIds.filter((id) => id !== task.id)
      : [...settings.completedTaskIds, task.id];
    void save({ ...settings, completedTaskIds: next });
  }

  const progress =
    plan.summary.totalHours > 0
      ? Math.round((plan.summary.doneHours / plan.summary.totalHours) * 100)
      : 0;

  return (
    <Panel
      title="Study plan"
      subtitle="Built from the gaps above, in the order they are ranked"
    >
      {/* The three inputs. Everything else is derived from them. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="hoursPerDay">
            Hours a day
          </label>
          <input
            id="hoursPerDay"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={16}
            step={0.5}
            className="field tabular"
            defaultValue={settings.hoursPerDay}
            disabled={busy}
            onBlur={(event) => {
              const hoursPerDay = Number(event.target.value);
              if (hoursPerDay !== settings.hoursPerDay && hoursPerDay >= 0.5) {
                void save({ ...settings, hoursPerDay });
              }
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="planDeadline">
            Ready by
            <span className="ml-1.5 font-normal text-faint">Optional</span>
          </label>
          <input
            id="planDeadline"
            type="date"
            className="field"
            defaultValue={settings.deadline ? settings.deadline.slice(0, 10) : ""}
            disabled={busy}
            onChange={(event) =>
              void save({ ...settings, deadline: event.target.value || null })
            }
          />
          <p className="mt-1.5 text-xs text-faint">
            {settings.deadline
              ? `${plan.summary.daysAvailable} days, ${plan.summary.hoursAvailable} hours of room.`
              : "No date set, so the plan uses a two-week horizon."}
          </p>
        </div>
      </div>

      {plan.summary.totalTasks > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">
              {plan.summary.doneTasks} of {plan.summary.totalTasks} done
            </span>
            <span className="tabular text-xs text-muted">
              {plan.summary.doneHours} of {plan.summary.totalHours} hours
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge"
            role="img"
            aria-label={`${progress} per cent of scheduled hours complete`}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-ios"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {plan.days.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">
          {plan.summary.daysAvailable === 0
            ? "The date you set has already passed, so there is nothing to schedule."
            : "Nothing to schedule — every skill on this analysis is already at its suggested level."}
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {plan.days.map((day) => (
            <li key={day.dayOffset}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-1.5">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                  {formatIstDate(day.date)}
                  <span className="font-normal text-faint">{relativeToNow(day.date)}</span>
                </h3>
                {/*
                  Split, not totalled. A finished task keeps its place in the
                  day but stops competing for capacity, so another can move in
                  beside it — which made a 2-hour day read "4 hours" and look
                  like the budget had been ignored.
                */}
                <span className="tabular inline-flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                  {(() => {
                    const left = Math.round(
                      day.tasks.filter((t) => !t.done).reduce((sum, t) => sum + t.hours, 0) * 10,
                    ) / 10;
                    const done = Math.round((day.hours - left) * 10) / 10;
                    if (done === 0) return `${left} ${left === 1 ? "hour" : "hours"}`;
                    if (left === 0) return `${done} done`;
                    return `${left} to do · ${done} done`;
                  })()}
                </span>
              </div>
              <ul className="divide-y divide-edge">
                {day.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={toggle} busy={busy} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* What did not fit, named rather than crammed into the last day. */}
      {plan.uncovered.length > 0 && (
        <div className="mt-5 rounded-lg border border-warn/30 bg-warn/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {plan.uncovered.length} skill{plan.uncovered.length === 1 ? "" : "s"} did not fit
          </h3>
          <ul className="mt-2 space-y-1.5">
            {plan.uncovered.map((item) => (
              <li key={item.skillId} className="text-sm text-muted">
                <span className="font-medium text-ink">{item.label}</span>
                <span className="text-faint">
                  {" "}
                  — {item.hoursShort} {item.hoursShort === 1 ? "hour" : "hours"} short
                  {item.importance === "required" ? ", and required for the role" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs leading-relaxed text-muted">
            More hours a day, or a later date, is the only thing that changes this.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-1.5 border-t border-edge pt-3">
        {plan.notes.map((note, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-faint">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
