import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { get, send } from "../lib/api";
import { MonthCalendar } from "../components/month-calendar";
import { Field, FormStatus, SelectField } from "../components/field";
import { Empty, ErrorNote, Loading, PageHeader, Panel, ProgressBar } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { PlannerMonth, StudyTaskDoc, TaskPriority } from "../lib/types";

/**
 * The study planner.
 *
 * Days are `YYYY-MM-DD` strings throughout, never Dates — a task belongs to a
 * calendar day, and parsing the day into an instant is how a planner files
 * Monday's work under Sunday for everyone east of Greenwich.
 *
 * Tasks here are stored rather than derived, unlike every verdict in this app.
 * That is deliberate: a verdict can be recomputed, and a stored one can go
 * stale and lie. An evening the student actually sat down and worked cannot be
 * recomputed from anything, so losing it loses their work.
 */

/** Today, in IST, as a day key — matching how the server files completions. */
function todayKey(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  return ist.toISOString().slice(0, 10);
}

function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

type Draft = {
  title: string;
  description: string;
  scheduledOn: string;
  startTime: string;
  durationMinutes: string;
  priority: TaskPriority;
};

const emptyDraft = (day: string): Draft => ({
  title: "",
  description: "",
  scheduledOn: day,
  startTime: "",
  durationMinutes: "60",
  priority: "normal",
});

export function PlannerPage() {
  usePageMeta("Study planner", "Plan your study sessions and track your progress.");

  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState<PlannerMonth | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<StudyTaskDoc | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: result, failure: f } = await get<PlannerMonth>(`/api/study-tasks?month=${month}`);
    if (f || !result) {
      setFailure(f?.message ?? "Your planner could not be loaded.");
      return;
    }
    setFailure(null);
    setData(result);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.scheduledOn === selected),
    [data, selected],
  );

  const daySummary = data?.days[selected];
  const donePercent =
    dayTasks.length === 0
      ? 0
      : Math.round((dayTasks.filter((t) => t.completedAt !== null).length / dayTasks.length) * 100);

  async function saveDraft() {
    if (!draft || busy) return;
    setBusy(true);
    setFields({});

    const body = {
      title: draft.title,
      description: draft.description,
      scheduledOn: draft.scheduledOn,
      startTime: draft.startTime || null,
      durationMinutes: draft.durationMinutes,
      priority: draft.priority,
    };

    const { failure: f } = editing
      ? await send(`/api/study-tasks/${editing._id}`, "PUT", body)
      : await send("/api/study-tasks", "POST", body);

    setBusy(false);
    if (f) {
      setFailure(f.message);
      setFields(f.fields);
      return;
    }
    setDraft(null);
    setEditing(null);
    setFailure(null);
    // The saved task may have moved to another month.
    if (body.scheduledOn.slice(0, 7) !== month) setMonth(body.scheduledOn.slice(0, 7));
    setSelected(body.scheduledOn);
    await load();
  }

  async function toggle(task: StudyTaskDoc) {
    if (busy) return;
    setBusy(true);
    const { failure: f } = await send(`/api/study-tasks/${task._id}/completion`, "PATCH", {
      done: task.completedAt === null,
    });
    setBusy(false);
    if (f) {
      setFailure(f.message);
      return;
    }
    await load();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const { failure: f } = await send(`/api/study-tasks/${id}`, "DELETE");
    setBusy(false);
    setConfirmDelete(null);
    if (f) {
      setFailure(f.message);
      return;
    }
    await load();
  }

  if (failure && !data) return <ErrorNote message={failure} />;
  if (!data) return <Loading label="Loading your planner" rows={3} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study planner"
        description="Plan your study sessions and track your progress."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setDraft(emptyDraft(selected));
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a task
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Panel>
          <MonthCalendar
            month={month}
            days={data.days}
            selected={selected}
            today={today}
            onSelect={setSelected}
            onMonthChange={setMonth}
          />
        </Panel>

        <div className="space-y-4">
          {/* Streak. Counted from work actually completed, never from tasks
              merely planned — and zero when nothing has been done. */}
          <div className="rounded-xl border border-warn/25 bg-warn/[0.06] p-4">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-warn" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Study streak</h2>
            </div>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="tabular text-2xl font-semibold text-warn">
                {data.streak.current}
              </span>
              <span className="text-xs text-muted">
                day{data.streak.current === 1 ? "" : "s"}
              </span>
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-faint">
              {data.streak.current === 0
                ? "Finish a task to start a streak. Planning one does not count."
                : `Longest run so far: ${data.streak.longest} day${data.streak.longest === 1 ? "" : "s"}.`}
            </p>
          </div>

          <Panel title="Quick add" subtitle={prettyDay(selected)}>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setEditing(null);
                setDraft(emptyDraft(selected));
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New task for this day
            </button>
          </Panel>
        </div>
      </div>

      {/* --- The editor, shown inline rather than in a modal so the calendar
              stays visible while a date is being chosen. ------------------- */}
      {draft && (
        <Panel title={editing ? "Edit task" : "New task"}>
          <div className="space-y-4">
            <Field
              label="Title"
              name="title"
              value={draft.title}
              onChange={(v) => setDraft({ ...draft, title: v })}
              error={fields.title}
              placeholder="Revise hash maps and two-pointer patterns"
              required
            />
            <Field
              label="Description"
              name="description"
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              error={fields.description}
              placeholder="What exactly you intend to cover"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="Date"
                name="scheduledOn"
                type="date"
                value={draft.scheduledOn}
                onChange={(v) => setDraft({ ...draft, scheduledOn: v })}
                error={fields.scheduledOn}
                required
              />
              <Field
                label="Start time"
                name="startTime"
                type="time"
                value={draft.startTime}
                onChange={(v) => setDraft({ ...draft, startTime: v })}
                error={fields.startTime}
              />
              <Field
                label="Minutes"
                name="durationMinutes"
                type="number"
                min={5}
                max={600}
                step="5"
                value={draft.durationMinutes}
                onChange={(v) => setDraft({ ...draft, durationMinutes: v })}
                error={fields.durationMinutes}
                required
              />
              <SelectField
                label="Priority"
                name="priority"
                value={draft.priority}
                options={PRIORITIES}
                onChange={(v) => setDraft({ ...draft, priority: v as TaskPriority })}
                error={fields.priority}
              />
            </div>

            <FormStatus error={failure} />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || draft.title.trim() === ""}
                onClick={() => void saveDraft()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {editing ? "Save changes" : "Add task"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setDraft(null);
                  setEditing(null);
                  setFields({});
                  setFailure(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* --- The selected day -------------------------------------------- */}
      <Panel
        title={`Tasks for ${prettyDay(selected)}`}
        subtitle={
          dayTasks.length === 0
            ? undefined
            : `${daySummary?.done ?? 0} of ${dayTasks.length} done · ${formatDuration(daySummary?.minutes ?? 0)} planned`
        }
      >
        {dayTasks.length === 0 ? (
          <Empty title="Nothing planned for this day">
            Pick another day on the calendar, or add a task for this one.
          </Empty>
        ) : (
          <>
            <div className="mb-4">
              <ProgressBar
                value={donePercent}
                label={`${prettyDay(selected)}: ${donePercent}% complete`}
                tone={donePercent === 100 ? "ok" : "accent"}
              />
            </div>

            <ul className="divide-y divide-edge">
              {dayTasks.map((task) => {
                const done = task.completedAt !== null;
                return (
                  <li key={task._id} className="flex items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busy}
                      onChange={() => void toggle(task)}
                      aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-edge accent-accent"
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${done ? "text-faint line-through" : ""}`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {task.startTime && (
                          <span className="chip bg-edge/50 text-muted">{task.startTime}</span>
                        )}
                        {task.skillLabel && (
                          <span className="chip bg-edge/50 text-muted">{task.skillLabel}</span>
                        )}
                        {task.priority === "high" && (
                          <span className="chip bg-bad/12 text-bad">High priority</span>
                        )}
                      </div>
                    </div>

                    <span className="tabular shrink-0 rounded-md bg-edge/50 px-2 py-1 text-2xs text-muted">
                      {formatDuration(task.durationMinutes)}
                    </span>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(task);
                          setDraft({
                            title: task.title,
                            description: task.description,
                            scheduledOn: task.scheduledOn,
                            startTime: task.startTime ?? "",
                            durationMinutes: String(task.durationMinutes),
                            priority: task.priority,
                          });
                        }}
                        aria-label={`Edit ${task.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-edge/40 hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      {/* Deleting asks first. A study task is the student's own
                          record of their season and there is no undo. */}
                      {confirmDelete === task._id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void remove(task._id)}
                            className="btn-danger btn-sm"
                            disabled={busy}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            aria-label="Keep this task"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-faint hover:text-ink"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(task._id)}
                          aria-label={`Delete ${task.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {failure && !draft && <ErrorNote message={failure} />}
    </div>
  );
}
