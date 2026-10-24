import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Lock,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { formatIst, formatIstWindow, formatLpa, relativeToNow } from "../lib/format";
import type { Clash, DriveStatus, DriveView, PriorityScore } from "../lib/types";

/** Presentational pieces shared across pages. */

/**
 * Status never travels on colour alone: each entry carries a word and a
 * glyph, so the board is still readable in greyscale and to anyone who does
 * not distinguish the green from the red.
 */
const STATUS: Record<
  DriveStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  actionable: { label: "Eligible", className: "bg-ok/12 text-ok", Icon: CheckCircle2 },
  unknown: { label: "Cannot determine", className: "bg-warn/12 text-warn", Icon: CircleHelp },
  blocked: { label: "Blocked by policy", className: "bg-info/12 text-info", Icon: Lock },
  not_eligible: { label: "Not eligible", className: "bg-bad/12 text-bad", Icon: XCircle },
  expired: { label: "Deadline passed", className: "bg-faint/12 text-faint", Icon: MinusCircle },
  resolved: { label: "Closed", className: "bg-accent/12 text-accent", Icon: CheckCircle2 },
};

export function StatusChip({ status, className = "" }: { status: DriveStatus; className?: string }) {
  const { label, className: tone, Icon } = STATUS[status];
  return (
    <span className={`chip ${tone} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/** The standard page heading: title, one line of context, optional actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  /** A small line above the title — today's date, a breadcrumb, a role. */
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">
            {eyebrow}
          </p>
        )}
        <h1 className="text-display text-[1.35rem] font-semibold sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-edge px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`px-4 py-4 sm:px-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ink" | "ok" | "warn" | "bad" | "info";
}) {
  const colour = {
    ink: "text-ink",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    info: "text-info",
  }[tone];
  return (
    <div className="panel px-4 py-3.5">
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={`tabular mt-1.5 text-2xl font-semibold ${colour}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-2xs text-faint">{hint}</div>}
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-edge px-5 py-8 text-center">
      {title && <p className="text-sm font-medium">{title}</p>}
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Loading state. The skeleton mirrors the shape of what is coming so the page
 * does not jump when the data lands.
 */
export function Loading({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[5.25rem]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-28 w-full" />
      ))}
    </div>
  );
}

export function ErrorNote({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-bad/35 bg-bad/5 px-4 py-3.5"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-bad">{message}</p>
      {action}
    </div>
  );
}

/** An inline advisory. `tone` picks the semantic colour; the icon reinforces it. */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "ok";
  children: React.ReactNode;
}) {
  const map = {
    info: { cls: "border-info/30 bg-info/5 text-info", Icon: Lock },
    warn: { cls: "border-warn/30 bg-warn/5 text-warn", Icon: AlertTriangle },
    ok: { cls: "border-ok/30 bg-ok/5 text-ok", Icon: CheckCircle2 },
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${map.cls}`}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

/**
 * The priority breakdown.
 *
 * The number is shown with its arithmetic because a student cannot act on
 * "87". Seeing that 45 of it is compensation and −7.5 is a clash is what makes
 * the ranking arguable, and a ranking you can argue with is one you can trust.
 *
 * Every value here comes from the API — nothing is recomputed in the browser.
 */
export function PriorityBreakdown({ score }: { score: PriorityScore }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[1.75rem] font-semibold leading-none">{score.total}</span>
        <span className="text-xs text-muted">of 100</span>
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-edge"
        role="img"
        aria-label={`Priority score ${score.total} out of 100`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-ios"
          style={{ width: `${Math.max(0, Math.min(100, score.total))}%` }}
        />
      </div>
      <dl className="mt-3.5 space-y-1.5 text-xs">
        {score.components.map((c) => (
          <div key={c.label} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-muted">
              <span className="font-medium text-ink">{c.label}</span>
              <span className="text-faint"> · {c.detail}</span>
            </dt>
            <dd
              className={`tabular shrink-0 font-medium ${
                c.points < 0 ? "text-bad" : c.points > 0 ? "text-ink" : "text-faint"
              }`}
            >
              {c.points > 0 ? "+" : ""}
              {c.points}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Every stated criterion with its verdict — the reason, not just the result.
 *
 * Criteria are listed independently and never collapsed: a drive can fail on
 * CGPA while clearing branch, and showing one combined verdict would hide
 * which of the two the student could actually do something about.
 */
export function CriteriaTable({ view }: { view: DriveView }) {
  const { checks } = view.eligibility;
  if (checks.length === 0) {
    return (
      <p className="text-sm text-muted">
        This notice states no eligibility criteria — it is open to everyone.
      </p>
    );
  }

  const tone = {
    pass: { chip: "bg-ok/12 text-ok", word: "Clear", Icon: CheckCircle2 },
    fail: { chip: "bg-bad/12 text-bad", word: "Short", Icon: XCircle },
    unknown: { chip: "bg-warn/12 text-warn", word: "Unknown", Icon: CircleHelp },
  };

  return (
    <ul className="divide-y divide-edge">
      {checks.map((check) => {
        const t = tone[check.state];
        return (
          <li key={check.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="text-sm font-medium">{check.label}</div>
              <div className="mt-0.5 text-xs text-muted">{check.message}</div>
            </div>
            <span className={`chip shrink-0 ${t.chip}`}>
              <t.Icon className="h-3 w-3" aria-hidden="true" />
              {t.word}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function counterpartOf(clash: Clash, driveId: string) {
  return clash.a.driveId === driveId ? clash.b : clash.a;
}

export function ownSideOf(clash: Clash, driveId: string) {
  return clash.a.driveId === driveId ? clash.a : clash.b;
}

export function ClashList({ view }: { view: DriveView }) {
  if (view.clashes.length === 0) return null;
  return (
    <ul className="space-y-2">
      {view.clashes.map((clash, i) => {
        const other = counterpartOf(clash, view.drive.id);
        const own = ownSideOf(clash, view.drive.id);
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
            <span className="min-w-0 text-muted">
              <span className="font-medium text-ink">{own.roundName}</span>{" "}
              <span className="tabular text-faint">
                ({formatIstWindow(own.startAt, own.endAt)})
              </span>{" "}
              overlaps {other.company} · {other.roundName} by{" "}
              <span className="font-medium text-warn">{clash.overlapMinutes} min</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function summarise(view: DriveView): string {
  const { eligibility } = view;
  if (eligibility.verdict === "eligible") {
    return eligibility.checks.length === 0
      ? "No criteria stated — open to all"
      : `Meets all ${eligibility.checks.length} stated criteria`;
  }
  if (eligibility.verdict === "not_eligible") {
    return eligibility.failures.map((f) => `${f.label} ${f.actual} vs ${f.required}`).join(" · ");
  }
  return `Needs ${eligibility.unknowns.map((u) => u.label.toLowerCase()).join(" and ")} in your profile`;
}

const STATUS_WORD: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  in_progress: "In progress",
  offer: "Offer received",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/**
 * A drive card.
 *
 * The header is a two-column grid rather than a wrapping flex row. A long role
 * — "Member of Technical Staff · 22 LPA · Bengaluru" — used to push the status
 * badge onto its own line on one card and not its neighbours, so a grid of
 * cards had badges at three different heights. `minmax(0,1fr)` plus `truncate`
 * keeps the text column shrinking instead of shoving the badge.
 */
export function DriveCard({ view }: { view: DriveView }) {
  const { drive, status, priority, nextDate, application, createdByName } = view;

  return (
    /* `min-w-0` is load-bearing: a grid item defaults to `min-width: auto`, so
       any child that refuses to shrink — a nowrap status chip, a long round
       name — widens the whole track past its container and pushes the page
       sideways. The same trap as flex children, and the same one-property fix. */
    <article className="panel flex min-w-0 flex-col p-4 transition-shadow duration-200 hover:shadow-raised">
      {/*
        A wrapping flex rather than a two-column grid. The text column asks for
        12rem and shrinks from there, so at ordinary widths the badge sits
        beside it and every card in a row aligns — which a plain wrapping flex
        got wrong, dropping the badge a line on whichever card had the longest
        role. Below about 340px there is genuinely no room for both, and the
        badge wraps underneath instead of pushing the card wider than the
        screen.
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <Link
            to={`/drives/${drive.id}`}
            className="block truncate text-[0.95rem] font-semibold hover:text-accent"
          >
            {drive.company}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">{drive.role}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <StatusChip status={status} />
          {priority && (
            <span className="tabular text-2xs text-faint">{priority.total} priority</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="tabular font-medium">{formatLpa(drive.ctcLpa)}</span>
        {drive.location && <span className="truncate text-faint">{drive.location}</span>}
      </div>

      <p className="mt-2.5 text-xs text-muted">{summarise(view)}</p>

      {status === "blocked" && view.policy.reason && (
        <p className="mt-2 text-xs text-info">{view.policy.reason}</p>
      )}

      {view.clashes.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-2">
          <ClashList view={view} />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-2xs text-faint">
        {nextDate ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {nextDate.live ? (
              <span className="chip bg-warn/12 text-warn">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                Live now
              </span>
            ) : (
              <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {nextDate.label} · {formatIst(nextDate.at)}
              {!nextDate.live && ` · ${relativeToNow(nextDate.at)}`}
            </span>
          </span>
        ) : (
          <span>Dates to be announced</span>
        )}
        {application && (
          <span className="text-muted">{STATUS_WORD[application.status]}</span>
        )}
        {/* A shared record with no author is a record nobody is accountable for. */}
        {createdByName && <span className="truncate">added by {createdByName}</span>}
      </div>
    </article>
  );
}

/**
 * A proportion, drawn.
 *
 * `role="progressbar"` with the three aria values rather than a bare div, so
 * the figure is announced rather than merely drawn — the bar is often the only
 * thing on a skill card that says how far along the student is.
 *
 * `label` is required: a progress bar with no accessible name announces as
 * "progress bar, 40%" with nothing saying 40% of what.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "accent",
  className = "",
}: {
  value: number;
  max?: number;
  label: string;
  tone?: "accent" | "ok" | "warn" | "bad" | "faint";
  className?: string;
}) {
  // Clamped so a bad input draws a full or empty bar rather than one that
  // overflows its track and bleeds across the card.
  const safeMax = max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const fill = {
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
    faint: "bg-faint",
  }[tone];

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-edge/70 ${className}`}
    >
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-300 motion-reduce:transition-none`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * A row of mutually exclusive choices — filters, a month/week switch.
 *
 * A `radiogroup` rather than a set of buttons, so arrow keys move between the
 * options and a screen reader announces which of how many is selected. Buttons
 * would announce as five unrelated controls that happen to sit together.
 *
 * Scrolls horizontally rather than wrapping: on a 320px screen five filters
 * cannot fit, and a wrapped row pushes the content it filters off the fold.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-0.5 overflow-x-auto rounded-lg border border-edge bg-canvas p-0.5 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-[0.4rem] px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
              selected ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`tabular text-2xs ${selected ? "text-muted" : "text-faint"}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
