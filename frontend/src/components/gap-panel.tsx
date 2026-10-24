import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Info,
  Loader2,
  MinusCircle,
  TrendingUp,
} from "lucide-react";
import { get, send } from "../lib/api";
import { ErrorNote, Panel } from "./ui";
import { ResourceList } from "./resource-list";
import type { GapAnalysis, Proficiency, SkillGap, StudentSkill } from "../lib/types";

/**
 * Skill gaps for one saved analysis.
 *
 * Rating happens here rather than on a separate settings page: the moment a
 * student sees "you have not rated Kubernetes" is the moment they know the
 * answer, and sending them elsewhere to record it loses most of them.
 *
 * Every level is the student's own assessment of themselves, and the panel
 * says so. Nothing here reports readiness — clearing the list means the
 * described skills are covered, which is not the same as passing an interview.
 */

const LEVELS: { value: Proficiency | ""; label: string }[] = [
  { value: "", label: "Not rated" },
  { value: "none", label: "Not started" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const STATUS: Record<
  SkillGap["status"],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  missing: { label: "Not started", className: "bg-bad/12 text-bad", Icon: MinusCircle },
  partial: { label: "Below target", className: "bg-warn/12 text-warn", Icon: TrendingUp },
  unknown: { label: "Not rated", className: "bg-faint/15 text-faint", Icon: CircleHelp },
  met: { label: "At target", className: "bg-ok/12 text-ok", Icon: CheckCircle2 },
};

export function GapPanel({ jobDescriptionId }: { jobDescriptionId: string }) {
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [mine, setMine] = useState<StudentSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Which skill has its resources open. One at a time: the point is to answer
  // "where do I learn this" for the gap being read, not to unfurl the lot.
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [gapsResult, skillsResult] = await Promise.all([
      get<GapAnalysis>(`/api/jd/${jobDescriptionId}/gaps`),
      get<{ skills: StudentSkill[] }>("/api/skills"),
    ]);
    if (gapsResult.failure || !gapsResult.data) {
      setError(gapsResult.failure?.message ?? "Skill gaps could not be loaded.");
      return;
    }
    setAnalysis(gapsResult.data);
    setMine(skillsResult.data?.skills ?? []);
  }, [jobDescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Rating writes the whole list and then refetches the gaps.
   *
   * The gap is derived on the server from the rating, so recomputing it in the
   * browser would be a second implementation of the same rule, free to drift
   * from the first.
   */
  async function rate(gap: SkillGap, level: Proficiency | "") {
    if (!mine || savingId) return;
    setSavingId(gap.skill.id);
    setError(null);

    const without = mine.filter((s) => s.skillId !== gap.skill.id);
    const next =
      level === ""
        ? without
        : [
            ...without,
            {
              skillId: gap.skill.id,
              label: gap.skill.label,
              level,
              source: "self_reported" as const,
            },
          ];

    const { failure } = await send<{ skills: StudentSkill[] }>("/api/skills", "PUT", {
      skills: next.map(({ skillId, label, level: l }) => ({
        skillId,
        label,
        level: l,
        source: "self_reported",
      })),
    });
    if (failure) {
      setError(failure.message);
      setSavingId(null);
      return;
    }
    await load();
    setSavingId(null);
  }

  if (error) return <ErrorNote message={error} />;

  if (!analysis || !mine) {
    return (
      <Panel title="Skill gaps">
        <div className="space-y-2" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading your skill gaps</span>
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-16 w-full" />
        </div>
      </Panel>
    );
  }

  if (analysis.gaps.length === 0) {
    return (
      <Panel title="Skill gaps">
        <p className="text-sm text-muted">
          No skills on this analysis yet, so there is nothing to compare against.
        </p>
      </Panel>
    );
  }

  const { summary } = analysis;

  return (
    <Panel
      title="Skill gaps"
      subtitle="What this role asks for, against what you say you can do"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Count label="At target" value={summary.met} tone="text-ok" />
        <Count label="Below target" value={summary.partial} tone="text-warn" />
        <Count label="Not started" value={summary.missing} tone="text-bad" />
        <Count label="Not rated" value={summary.unknown} tone="text-faint" />
      </div>

      {summary.requiredOutstanding > 0 && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-medium text-ink">
            {summary.requiredOutstanding} required skill
            {summary.requiredOutstanding === 1 ? "" : "s"}
          </span>{" "}
          {summary.requiredOutstanding === 1 ? "is" : "are"} not yet at the suggested level.
        </p>
      )}

      <ul className="mt-4 divide-y divide-edge">
        {analysis.gaps.map((gap) => {
          const tone = STATUS[gap.status];
          const busy = savingId === gap.skill.id;
          const open = openSkillId === gap.skill.id;
          return (
            <li key={gap.skill.id} className="py-3 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{gap.skill.label}</span>
                    <span className={`chip ${tone.className}`}>
                      <tone.Icon className="h-3 w-3" aria-hidden="true" />
                      {tone.label}
                    </span>
                    {gap.skill.importance === "required" ? (
                      <span className="chip bg-edge/60 text-muted">Required</span>
                    ) : (
                      <span className="chip bg-edge/40 text-faint">Preferred</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{gap.rationale}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenSkillId(open ? null : gap.skill.id)}
                    aria-expanded={open}
                    aria-controls={`resources-${gap.skill.id}`}
                    className="btn-quiet btn-sm"
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Learn</span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {busy && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" aria-hidden="true" />
                  )}
                  <label className="sr-only" htmlFor={`level-${gap.skill.id}`}>
                    Your level in {gap.skill.label}
                  </label>
                  <select
                    id={`level-${gap.skill.id}`}
                    className="field w-auto py-1 text-xs"
                    value={gap.level ?? ""}
                    disabled={busy}
                    onChange={(event) => rate(gap, event.target.value as Proficiency | "")}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {open && (
                <div
                  id={`resources-${gap.skill.id}`}
                  className="mt-3 animate-slide-up rounded-lg border border-edge bg-canvas/40 p-3.5"
                >
                  <ResourceList skillId={gap.skill.id} label={gap.skill.label} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* What this analysis cannot tell them, stated rather than implied. */}
      <ul className="mt-4 space-y-1.5 border-t border-edge pt-3">
        {analysis.caveats.map((caveat, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-faint">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{caveat}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="panel-flush px-3 py-2">
      <div className="truncate text-2xs text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
