import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Info,
  MinusCircle,
  TrendingUp,
} from "lucide-react";
import { get, send } from "../lib/api";
import { SkillRadar } from "../components/skill-radar";
import {
  Empty,
  ErrorNote,
  Loading,
  PageHeader,
  Panel,
  ProgressBar,
  SegmentedControl,
} from "../components/ui";
import { SelectField } from "../components/field";
import { usePageMeta } from "../lib/use-page-meta";
import type { GapAnalysis, Proficiency, SkillGap, StudentSkill } from "../lib/types";

/**
 * Skills Gap Analysis.
 *
 * The page answers one question — what stands between this student and this
 * role — and it answers it with their own numbers. Everything on screen is
 * derived from the saved analysis and their self-ratings; nothing is stored,
 * so correcting a rating changes the whole page on the next read.
 *
 * The honesty rule runs through every figure: a skill the student has not
 * rated has an *undecided* gap, not a zero one. It is excluded from the
 * totals, left off the radar, and counted separately — because a tool that
 * averages unknowns as nought is most confident exactly when it knows least.
 */

const LEVELS: { value: Proficiency | ""; label: string }[] = [
  { value: "", label: "Not assessed" },
  { value: "none", label: "Not started" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const LEVEL_LABEL: Record<Proficiency, string> = {
  none: "Not started",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const RANK: Record<Proficiency, number> = {
  none: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * The status shown on a card.
 *
 * Deliberately finer than the engine's four, because "below target" covers
 * both a student one evening short and one an entire level behind on a skill
 * the role requires. Icon and text carry the meaning as well as colour.
 */
type CardStatus = "critical" | "below" | "on_target" | "strength" | "not_assessed";

const STATUS: Record<
  CardStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  critical: { label: "Critical gap", className: "bg-bad/12 text-bad", Icon: MinusCircle },
  below: { label: "Below target", className: "bg-warn/12 text-warn", Icon: TrendingUp },
  on_target: { label: "On target", className: "bg-ok/12 text-ok", Icon: CheckCircle2 },
  strength: { label: "Strength", className: "bg-ok/12 text-ok", Icon: CheckCircle2 },
  not_assessed: { label: "Not assessed", className: "bg-faint/15 text-faint", Icon: CircleHelp },
};

/** Mirrors `CRITICAL_GAP_STEPS` in the engine, which owns the rule. */
const CRITICAL_GAP_STEPS = 2;

function statusOf(gap: SkillGap): CardStatus {
  if (gap.status === "unknown") return "not_assessed";
  if (gap.distance <= -1) return "strength";
  if (gap.distance <= 0) return "on_target";
  if (gap.skill.importance === "required" && gap.distance >= CRITICAL_GAP_STEPS) return "critical";
  return "below";
}

type Filter = "all" | "critical" | "below" | "strengths" | "not_assessed";

interface SavedRow {
  _id: string;
  roleTitle: string | null;
  company: string | null;
}

export function SkillsGapPage() {
  usePageMeta(
    "Skills gap analysis",
    "Compare your current skill levels with what a role asks for.",
  );

  const [params, setParams] = useSearchParams();
  const selectedId = params.get("jd") ?? "";

  const [saved, setSaved] = useState<SavedRow[] | null>(null);
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [mine, setMine] = useState<StudentSkill[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // The saved analyses, which are the roles this page can compare against.
  useEffect(() => {
    void (async () => {
      const { data, failure: f } = await get<{ jobDescriptions: SavedRow[] }>("/api/jd");
      if (f || !data) {
        setFailure(f?.message ?? "Your saved analyses could not be loaded.");
        return;
      }
      setSaved(data.jobDescriptions);
      // Default to the most recent, so the page is useful without a click.
      if (!selectedId && data.jobDescriptions.length > 0) {
        setParams({ jd: data.jobDescriptions[0]._id }, { replace: true });
      }
    })();
    // Runs once: the list does not change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!selectedId) return;
    const [gapsResult, skillsResult] = await Promise.all([
      get<GapAnalysis>(`/api/jd/${selectedId}/gaps`),
      get<{ skills: StudentSkill[] }>("/api/skills"),
    ]);
    if (gapsResult.failure || !gapsResult.data) {
      setFailure(gapsResult.failure?.message ?? "The gap analysis could not be loaded.");
      return;
    }
    setFailure(null);
    setAnalysis(gapsResult.data);
    setMine(skillsResult.data?.skills ?? []);
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Rating writes the whole list and refetches.
   *
   * The gap is derived on the server from the rating, so recomputing it here
   * would be a second implementation of the same rule, free to drift.
   */
  async function rate(gap: SkillGap, level: Proficiency | "") {
    if (!mine || savingId) return;
    setSavingId(gap.skill.id);

    const without = mine.filter((s) => s.skillId !== gap.skill.id);
    const next =
      level === ""
        ? without
        : [...without, { skillId: gap.skill.id, label: gap.skill.label, level, source: "self_reported" as const }];

    const { failure: f } = await send("/api/skills", "PUT", {
      skills: next.map(({ skillId, label, level: l }) => ({
        skillId,
        label,
        level: l,
        source: "self_reported",
      })),
    });
    if (f) {
      setFailure(f.message);
      setSavingId(null);
      return;
    }
    await load();
    setSavingId(null);
  }

  const counts = useMemo(() => {
    const gaps = analysis?.gaps ?? [];
    const by = (s: CardStatus) => gaps.filter((g) => statusOf(g) === s).length;
    return {
      all: gaps.length,
      critical: by("critical"),
      below: by("below"),
      strengths: by("strength") + by("on_target"),
      not_assessed: by("not_assessed"),
    };
  }, [analysis]);

  const shown = useMemo(() => {
    const gaps = analysis?.gaps ?? [];
    if (filter === "all") return gaps;
    if (filter === "strengths")
      return gaps.filter((g) => ["strength", "on_target"].includes(statusOf(g)));
    return gaps.filter((g) => statusOf(g) === filter);
  }, [analysis, filter]);

  if (failure && !analysis) return <ErrorNote message={failure} />;
  if (saved === null) return <Loading label="Loading your analyses" rows={2} />;

  if (saved.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Skills gap analysis"
          description="Compare your current skill levels with what a role asks for."
        />
        <Panel>
          <Empty
            title="No role to compare against yet"
            action={
              <Link to="/prepare/new" className="btn-primary">
                Analyse a job description
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          >
            This page compares your skills against what a specific role asks for, so it needs a job
            description first. Paste one and the skills it names become the list below.
          </Empty>
        </Panel>
      </div>
    );
  }

  const summary = analysis?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills gap analysis"
        description="Compare your current skill levels with what a role asks for."
      />

      {/* Which role. A select rather than tabs: a student may have a dozen
          saved analyses, and tabs would wrap into three rows. */}
      <div className="max-w-md">
        <SelectField
          label="Target role"
          name="jd"
          required
          value={selectedId}
          onChange={(value) => setParams({ jd: value })}
          options={saved.map((row) => ({
            value: row._id,
            label: [row.roleTitle, row.company].filter(Boolean).join(" · ") || "Untitled analysis",
          }))}
        />
      </div>

      {!analysis ? (
        <Loading label="Working out your gaps" rows={3} />
      ) : analysis.gaps.length === 0 ? (
        <Panel>
          <Empty title="This analysis names no skills">
            The job description had nothing this tool could recognise as a skill. Open it and add
            the ones it asks for by hand.
          </Empty>
        </Panel>
      ) : (
        <>
          {/* --- The four headline figures ------------------------------ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Total skill gap"
              value={summary?.totalGap ?? 0}
              unit="steps"
              hint={`Across ${summary?.evaluated ?? 0} rated skill${summary?.evaluated === 1 ? "" : "s"}`}
            />
            <MetricCard
              label="Average gap"
              value={summary?.averageGap ?? 0}
              unit="steps"
              hint="Per rated skill"
            />
            <MetricCard
              label="Critical gaps"
              value={summary?.criticalGaps ?? 0}
              tone="text-bad"
              hint={`Required skills ${CRITICAL_GAP_STEPS}+ steps short`}
            />
            <MetricCard
              label="Strengths"
              value={summary?.strengths ?? 0}
              tone="text-ok"
              hint="At or above target"
            />
          </div>

          {/* --- Radar -------------------------------------------------- */}
          <Panel
            title="Your level against the target"
            subtitle="Each axis runs from not started to advanced"
          >
            <SkillRadar gaps={analysis.gaps} />
          </Panel>

          {/* --- Filters and cards -------------------------------------- */}
          <div>
            <SegmentedControl<Filter>
              label="Filter skills"
              value={filter}
              onChange={setFilter}
              className="mb-4"
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "critical", label: "Critical", count: counts.critical },
                { value: "below", label: "Below target", count: counts.below },
                { value: "strengths", label: "Strengths", count: counts.strengths },
                { value: "not_assessed", label: "Not assessed", count: counts.not_assessed },
              ]}
            />

            {shown.length === 0 ? (
              <Panel>
                <Empty title="Nothing in this group">
                  Every skill on this role sits somewhere else. Switch the filter to see them.
                </Empty>
              </Panel>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {shown.map((gap) => (
                  <SkillCard
                    key={gap.skill.id}
                    gap={gap}
                    busy={savingId === gap.skill.id}
                    onRate={(level) => void rate(gap, level)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* What this cannot tell them, said rather than implied. */}
          <ul className="space-y-1.5 border-t border-edge pt-3">
            {analysis.caveats.map((caveat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-faint">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {failure && <ErrorNote message={failure} />}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  hint,
  tone = "text-ink",
}: {
  label: string;
  value: number;
  unit?: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="panel-flush px-3.5 py-3">
      <div className="truncate text-2xs text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`tabular text-2xl font-semibold ${tone}`}>{value}</span>
        {unit && <span className="text-2xs text-faint">{unit}</span>}
      </div>
      <div className="mt-0.5 text-2xs leading-snug text-faint">{hint}</div>
    </div>
  );
}

function SkillCard({
  gap,
  busy,
  onRate,
}: {
  gap: SkillGap;
  busy: boolean;
  onRate: (level: Proficiency | "") => void;
}) {
  const status = statusOf(gap);
  const tone = STATUS[status];
  const current = gap.level === null ? null : RANK[gap.level];
  const target = RANK[gap.target];

  return (
    <article className="panel flex min-w-0 flex-col p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-44">
          <h3 className="truncate text-sm font-semibold">{gap.skill.label}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`chip ${tone.className}`}>
              <tone.Icon className="h-3 w-3" aria-hidden="true" />
              {tone.label}
            </span>
            <span
              className={`chip ${
                gap.skill.importance === "required"
                  ? "bg-edge/60 text-muted"
                  : "bg-edge/40 text-faint"
              }`}
            >
              {gap.skill.importance === "required" ? "Required" : "Preferred"}
            </span>
          </div>
        </div>

        <label className="sr-only" htmlFor={`level-${gap.skill.id}`}>
          Your level in {gap.skill.label}
        </label>
        <select
          id={`level-${gap.skill.id}`}
          className="field w-auto shrink-0 py-1 text-xs"
          value={gap.level ?? ""}
          disabled={busy}
          onChange={(event) => onRate(event.target.value as Proficiency | "")}
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Current against target. The target tick is drawn on the same track,
          so the distance is a distance rather than two separate numbers. */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-2xs text-muted">
          <span>{gap.level === null ? "Not assessed" : LEVEL_LABEL[gap.level]}</span>
          <span className="text-faint">target {LEVEL_LABEL[gap.target]}</span>
        </div>
        <div className="relative mt-1.5">
          <ProgressBar
            value={current ?? 0}
            max={3}
            label={`${gap.skill.label}: ${gap.level === null ? "not assessed" : LEVEL_LABEL[gap.level]} of a target of ${LEVEL_LABEL[gap.target]}`}
            tone={
              status === "critical"
                ? "bad"
                : status === "below"
                  ? "warn"
                  : status === "not_assessed"
                    ? "faint"
                    : "ok"
            }
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted"
            style={{ left: `${(target / 3) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-2xs leading-relaxed text-muted">{gap.rationale}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3">
        <Link to="/prepare" className="btn-quiet btn-sm">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Learn this
        </Link>
      </div>
    </article>
  );
}
