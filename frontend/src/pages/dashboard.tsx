import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Plus,
  Target,
} from "lucide-react";
import { get, send } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePageMeta } from "../lib/use-page-meta";
import { ErrorNote, Loading, PageHeader, Panel, ProgressBar } from "../components/ui";
import { FocusTimer } from "../components/focus-timer";
import { formatIst, formatIstDate, relativeToNow } from "../lib/format";
import type { DashboardData, PriorityItem } from "../lib/types";

/**
 * The overview.
 *
 * Every number and every row comes from the student's own records — the
 * board, their study tasks, their notes, their assessment attempts. Nothing
 * is a placeholder and nothing is invented to fill a panel: when there is
 * nothing pressing the page says so, which is information rather than an
 * empty grid pretending to be a dashboard.
 *
 * The ranking of what matters most is computed on the server, where it is
 * tested, rather than reassembled here from five separate requests.
 */

const URGENCY: Record<PriorityItem["urgency"], string> = {
  critical: "bg-bad/12 text-bad",
  soon: "bg-warn/12 text-warn",
  normal: "bg-edge/60 text-muted",
};

const KIND_ICON: Record<PriorityItem["kind"], typeof Target> = {
  drive_deadline: CalendarClock,
  study_task: BookOpen,
  skill_gap: Target,
  profile_incomplete: AlertTriangle,
  assessment_weak: Target,
};

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "nothing";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function DashboardPage() {
  const { user, isOfficer } = useAuth();
  usePageMeta("Overview");

  const [data, setData] = useState<DashboardData | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: result, failure: f } = await get<DashboardData>("/api/dashboard");
    if (f || !result) {
      setFailure(f?.message ?? "Your overview could not be loaded.");
      return;
    }
    setFailure(null);
    setData(result);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleTask(id: string, done: boolean) {
    if (busy) return;
    setBusy(true);
    const { failure: f } = await send(`/api/study-tasks/${id}/completion`, "PATCH", { done });
    setBusy(false);
    if (f) {
      setFailure(f.message);
      return;
    }
    await load();
  }

  const firstName = (user?.name ?? "").split(" ")[0] || "there";

  if (failure && !data) {
    return (
      <ErrorNote
        message={failure}
        action={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()}>
            Try again
          </button>
        }
      />
    );
  }
  if (!data) return <Loading label="Building your overview" rows={3} />;

  const { stats, today, streak, recent } = data;
  const dayPercent =
    today.tasks.length === 0 ? 0 : Math.round((today.doneCount / today.tasks.length) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatIstDate(new Date())}
        title={`Hello, ${firstName}`}
        description={
          stats.total === 0
            ? "No drives on your board yet."
            : `${stats.actionable} of ${stats.total} drives are open to you right now.`
        }
        actions={
          isOfficer ? (
            <Link to="/drives/new" className="btn-ghost">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a drive
            </Link>
          ) : undefined
        }
      />

      {/* --- Metrics, every one from a real record ------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Open to you"
          value={String(stats.actionable)}
          hint={`of ${stats.total} drive${stats.total === 1 ? "" : "s"}`}
          href="/drives"
        />
        <Metric
          label="Due this week"
          value={String(stats.dueThisWeek)}
          hint="deadlines and rounds"
          href="/calendar"
          tone={stats.dueThisWeek > 0 ? "text-warn" : undefined}
        />
        <Metric
          label="Today's study"
          value={`${today.doneCount}/${today.tasks.length}`}
          hint={today.tasks.length === 0 ? "nothing planned" : formatMinutes(today.plannedMinutes)}
          href="/planner"
        />
        <Metric
          label="Study streak"
          value={String(streak.current)}
          hint={streak.current === 1 ? "day" : "days"}
          href="/planner"
          tone={streak.current > 0 ? "text-warn" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {/* --- Main column ------------------------------------------- */}
        <div className="min-w-0 space-y-5">
          <Panel
            title="What to do next"
            subtitle="Ranked by what expires soonest"
            action={
              <Link to="/drives" className="link text-xs">
                All drives
              </Link>
            }
          >
            {data.priorities.length === 0 ? (
              <div className="flex items-start gap-2.5 py-1">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-muted">
                  Nothing pressing. No deadline inside a week that you have not applied to, and
                  today's study is clear.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-edge">
                {data.priorities.map((item, i) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <li key={i}>
                      <Link
                        to={item.href}
                        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-edge/30"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{item.title}</span>
                            {item.when && (
                              <span className={`chip ${URGENCY[item.urgency]}`}>{item.when}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.detail}</p>
                        </div>
                        <ArrowRight
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Recently written and attempted — only records that exist. */}
          <Panel title="Recent work" subtitle="What you last wrote and practised">
            {recent.notes.length === 0 && recent.attempts.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted">Nothing yet.</p>
                <Link to="/notes" className="btn-ghost btn-sm">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Write a note
                </Link>
                <Link to="/practice" className="btn-ghost btn-sm">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  Try a practice set
                </Link>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {recent.notes.map((note) => (
                  <Link
                    key={note._id}
                    to="/notes"
                    className="panel-flush min-w-0 px-3 py-2.5 transition-colors hover:bg-edge/30"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                      <span className="truncate text-sm font-medium">{note.title}</span>
                    </div>
                    <p className="mt-0.5 text-2xs text-faint">
                      Edited {relativeToNow(note.updatedAt)}
                    </p>
                  </Link>
                ))}
                {recent.attempts.map((attempt) => (
                  <Link
                    key={attempt._id}
                    to="/practice"
                    className="panel-flush min-w-0 px-3 py-2.5 transition-colors hover:bg-edge/30"
                  >
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                      <span className="truncate text-sm font-medium">{attempt.skillLabel}</span>
                    </div>
                    <p className="mt-0.5 text-2xs text-faint">
                      {attempt.correct} of {attempt.total} · {relativeToNow(attempt.submittedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* --- Side column -------------------------------------------- */}
        <div className="min-w-0 space-y-4">
          <FocusTimer />

          <Panel title="Today" subtitle={formatIstDate(new Date())}>
            {today.tasks.length === 0 && data.agenda.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Nothing scheduled.{" "}
                <Link to="/planner" className="link">
                  Plan something
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-4">
                {today.tasks.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-2xs text-muted">
                      <span>Your study</span>
                      <span className="tabular">{dayPercent}%</span>
                    </div>
                    <ProgressBar
                      value={dayPercent}
                      label={`Today: ${dayPercent}% of study done`}
                      tone={dayPercent === 100 ? "ok" : "accent"}
                      className="mb-2.5"
                    />
                    <ul className="space-y-1.5">
                      {today.tasks.map((task) => {
                        const done = task.completedAt !== null;
                        return (
                          <li key={task._id} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={done}
                              disabled={busy}
                              onChange={() => void toggleTask(task._id, !done)}
                              aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-edge accent-accent"
                            />
                            <span
                              className={`min-w-0 flex-1 text-xs leading-relaxed ${
                                done ? "text-faint line-through" : ""
                              }`}
                            >
                              {task.title}
                            </span>
                            <span className="tabular shrink-0 text-2xs text-faint">
                              {formatMinutes(task.durationMinutes)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {data.agenda.length > 0 && (
                  <div className={today.tasks.length > 0 ? "border-t border-edge pt-3" : ""}>
                    {/* Official placement events, kept visually apart from the
                        student's own study: one is a commitment to a company,
                        the other is a note to self. */}
                    <p className="mb-2 text-2xs text-muted">Placement events</p>
                    <ul className="space-y-2">
                      {data.agenda.slice(0, 4).map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Clock3
                            className="mt-0.5 h-3 w-3 shrink-0 text-accent"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{item.company}</p>
                            <p className="text-2xs text-faint">
                              {item.label} · {formatIst(item.at)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {streak.current > 0 && (
            <div className="rounded-xl border border-warn/25 bg-warn/[0.06] p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                <span className="text-sm font-semibold">
                  {streak.current} day{streak.current === 1 ? "" : "s"} in a row
                </span>
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-faint">
                Longest run so far: {streak.longest} day{streak.longest === 1 ? "" : "s"}.
              </p>
            </div>
          )}
        </div>
      </div>

      {failure && <ErrorNote message={failure} />}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  href,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  tone?: string;
}) {
  return (
    <Link to={href} className="panel-flush min-w-0 px-3.5 py-3 transition-colors hover:bg-edge/30">
      <div className="truncate text-2xs text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="truncate text-2xs text-faint">{hint}</div>
    </Link>
  );
}
