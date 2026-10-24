import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info, Loader2, Sparkles } from "lucide-react";
import { get, send } from "../lib/api";
import { Field, FormStatus, SelectField } from "./field";
import { Empty, Panel } from "./ui";
import type { PlanProposal, ProposedTask } from "../lib/types";

/**
 * Turning a skill-gap analysis into dated tasks on the planner.
 *
 * Two steps on purpose. The student asks for a proposal, reads it, unticks
 * what they disagree with, and only then does anything get saved. A plan that
 * appeared in someone's calendar unasked is a plan they stop trusting, and the
 * tasks it creates are theirs to edit afterwards.
 *
 * Regenerating is safe: the server skips any task it already created for this
 * role, so a second run adds what is new and leaves everything already
 * scheduled alone — including anything finished.
 */

interface SavedRow {
  _id: string;
  roleTitle: string | null;
  company: string | null;
}

function prettyDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function PlanGenerator({ onCommitted }: { onCommitted: () => void }) {
  const [saved, setSaved] = useState<SavedRow[] | null>(null);
  const [jdId, setJdId] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const [deadline, setDeadline] = useState("");

  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await get<{ jobDescriptions: SavedRow[] }>("/api/jd");
      const rows = data?.jobDescriptions ?? [];
      setSaved(rows);
      if (rows.length > 0) setJdId(rows[0]._id);
    })();
  }, []);

  async function preview() {
    if (busy || !jdId) return;
    setBusy(true);
    setFailure(null);
    setFields({});
    setResult(null);

    const { data, failure: f } = await send<PlanProposal>("/api/study-tasks/plan/preview", "POST", {
      jobDescriptionId: jdId,
      hoursPerDay,
      deadline: deadline || null,
    });
    setBusy(false);

    if (f || !data) {
      setFailure(f?.message ?? "A plan could not be built.");
      setFields(f?.fields ?? {});
      return;
    }
    setProposal(data);
    // Everything not already on the planner starts ticked: the common case is
    // accepting the proposal, and unticking is the deliberate act.
    setChosen(new Set(data.proposed.filter((t) => !t.alreadyAdded).map((t) => t.planTaskId)));
  }

  async function commit() {
    if (!proposal || busy) return;
    const tasks = proposal.proposed.filter((t) => chosen.has(t.planTaskId));
    if (tasks.length === 0) return;

    setBusy(true);
    const { data, failure: f } = await send<{ added: number; skipped: number }>(
      "/api/study-tasks/plan/commit",
      "POST",
      {
        jobDescriptionId: jdId,
        tasks: tasks.map(({ alreadyAdded: _ignored, ...rest }) => rest),
      },
    );
    setBusy(false);

    if (f || !data) {
      setFailure(f?.message ?? "Those tasks could not be saved.");
      return;
    }
    setProposal(null);
    setChosen(new Set());
    setResult(
      `${data.added} task${data.added === 1 ? "" : "s"} added to your planner.` +
        (data.skipped > 0 ? ` ${data.skipped} were already there.` : ""),
    );
    onCommitted();
  }

  if (saved === null) return <Panel title="Generate a study plan"><div className="skeleton h-20 w-full" /></Panel>;

  if (saved.length === 0) {
    return (
      <Panel title="Generate a study plan">
        <Empty
          title="No role to plan for yet"
          action={
            <Link to="/prepare/new" className="btn-primary">
              Analyse a job description
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        >
          A plan is built from the gap between what a role asks for and what you have rated
          yourself at, so it needs a job description first.
        </Empty>
      </Panel>
    );
  }

  const toAdd = proposal?.proposed.filter((t) => chosen.has(t.planTaskId)).length ?? 0;
  const byDay = new Map<string, ProposedTask[]>();
  for (const task of proposal?.proposed ?? []) {
    byDay.set(task.scheduledOn, [...(byDay.get(task.scheduledOn) ?? []), task]);
  }

  return (
    <Panel
      title="Generate a study plan"
      subtitle="Built from your skill gaps for a role, then yours to edit"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Target role"
          name="planJd"
          value={jdId}
          onChange={setJdId}
          options={saved.map((row) => ({
            value: row._id,
            label: [row.roleTitle, row.company].filter(Boolean).join(" · ") || "Untitled analysis",
          }))}
          required
        />
        <Field
          label="Hours a day"
          name="hoursPerDay"
          type="number"
          min={0.5}
          max={16}
          step="0.5"
          value={hoursPerDay}
          onChange={setHoursPerDay}
          error={fields.hoursPerDay}
          required
        />
        <Field
          label="Ready by"
          name="deadline"
          type="date"
          value={deadline}
          onChange={setDeadline}
          error={fields.deadline}
          hint="Blank uses a two-week horizon"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void preview()}>
          {busy && !proposal ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {proposal ? "Rebuild proposal" : "Build a plan"}
        </button>
        {proposal && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setProposal(null);
              setChosen(new Set());
            }}
          >
            Discard
          </button>
        )}
      </div>

      <FormStatus error={failure} success={result} />

      {proposal && (
        <div className="mt-5 border-t border-edge pt-4">
          {proposal.proposed.length === 0 ? (
            <Empty title="Nothing to schedule">
              Every skill this role names is already at its target, so there is no gap to plan
              around.
            </Empty>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  <span className="font-medium text-ink">{toAdd}</span> of{" "}
                  {proposal.proposed.length} selected
                </p>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={busy || toAdd === 0}
                  onClick={() => void commit()}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Add {toAdd} to planner
                </button>
              </div>

              <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {[...byDay.entries()].map(([day, tasks]) => (
                  <li key={day}>
                    <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">
                      {prettyDay(day)}
                    </p>
                    <ul className="space-y-1">
                      {tasks.map((task) => (
                        <li key={task.planTaskId} className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={chosen.has(task.planTaskId)}
                            disabled={task.alreadyAdded}
                            onChange={(event) => {
                              const next = new Set(chosen);
                              if (event.target.checked) next.add(task.planTaskId);
                              else next.delete(task.planTaskId);
                              setChosen(next);
                            }}
                            aria-label={`Include "${task.title}"`}
                            className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-edge accent-accent"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              {task.title}
                              {task.alreadyAdded && (
                                <span className="chip ml-2 bg-edge/60 text-faint">
                                  already added
                                </span>
                              )}
                            </p>
                            <p className="truncate text-2xs text-faint">{task.description}</p>
                          </div>
                          <span className="tabular shrink-0 text-2xs text-muted">
                            {formatDuration(task.durationMinutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* What the plan could NOT fit, said plainly rather than dropped. */}
          {proposal.uncovered.length > 0 && (
            <div className="mt-4 rounded-lg border border-warn/25 bg-warn/[0.06] p-3">
              <p className="text-xs font-medium text-warn">
                {proposal.uncovered.length} skill
                {proposal.uncovered.length === 1 ? "" : "s"} would not fit in the time available
              </p>
              <ul className="mt-1.5 space-y-1">
                {proposal.uncovered.map((item) => (
                  <li key={item.skillId} className="text-2xs leading-relaxed text-muted">
                    <span className="font-medium">{item.label}</span> — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposal.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {proposal.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-2xs leading-relaxed text-faint">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
