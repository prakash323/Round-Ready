import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Plus, ShieldCheck } from "lucide-react";
import { Panel, PageHeader } from "../components/ui";
import { formatIst, formatIstDate, relativeToNow } from "../lib/format";
import type { OfficerOverview } from "../lib/types";

/**
 * The CDC officer's overview.
 *
 * Deliberately not the student page with different numbers. An officer does
 * not have a board of drives they might sit for, a skill gap or a study
 * plan — they publish notices to a batch, and what they need to know is how
 * many, closing when, and which ones are incomplete.
 *
 * It shows aggregates and the notices themselves. It does not open any
 * individual student's profile, applications or notes: knowing forty people
 * applied is operations; knowing which forty is not the officer's business
 * from here.
 */
export function OfficerOverviewPage({ data, name }: { data: OfficerOverview; name: string }) {
  const firstName = name.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatIstDate(new Date())}
        title={`Hello, ${firstName}`}
        description={
          data.counts.drives === 0
            ? "Nothing published to this batch yet."
            : `${data.counts.drives} drive${data.counts.drives === 1 ? "" : "s"} published to ${data.counts.students} student${data.counts.students === 1 ? "" : "s"}.`
        }
        actions={
          <Link to="/drives/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Publish a drive
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Drives live" value={String(data.counts.drives)} hint="on this batch's board" href="/drives" />
        <Metric label="Students" value={String(data.counts.students)} hint="in this batch" href="/drives" />
        <Metric
          label="Applications"
          value={String(data.counts.applications)}
          hint="across all drives"
          href="/drives"
        />
        <Metric
          label="Need attention"
          value={String(data.counts.needingAttention)}
          hint="incomplete notices"
          href="/drives"
          tone={data.counts.needingAttention > 0 ? "text-warn" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          {/* What the officer can actually fix, derived from the notice
              itself rather than from anyone's board. */}
          <Panel
            title="Notices worth a second look"
            subtitle="Checked against what each drive states, not against any student"
          >
            {data.health.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Every live drive states a deadline, its rounds and at least one eligibility
                criterion. Nothing to fix.
              </p>
            ) : (
              <ul className="divide-y divide-edge">
                {data.health.map((drive) => (
                  <li key={drive.driveId}>
                    <Link
                      to={`/drives/${drive.driveId}/edit`}
                      className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-edge/30"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-warn"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {drive.company}
                          <span className="ml-1.5 font-normal text-muted">{drive.role}</span>
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {drive.issues.map((issue) => (
                            <li key={issue} className="text-xs leading-relaxed text-muted">
                              {data.issueText[issue]}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <ArrowRight
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Closing this week" subtitle="Registration deadlines">
            {data.closingSoon.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                No registration closes in the next seven days.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.closingSoon.map((drive) => (
                  <li key={drive._id}>
                    <Link to={`/drives/${drive._id}`} className="block min-w-0">
                      <div className="flex items-start gap-2">
                        <CalendarClock
                          className="mt-0.5 h-3 w-3 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{drive.company}</p>
                          <p className="text-2xs text-faint">
                            {drive.applicationDeadline
                              ? `${formatIst(drive.applicationDeadline)} · ${relativeToNow(drive.applicationDeadline)}`
                              : "No deadline"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Higher-offer policy">
            <p className="text-sm leading-relaxed text-muted">
              {data.policyConfigured
                ? "Your batch is on multipliers you set."
                : "Your batch is on the standard multipliers — nobody has changed them."}
            </p>
            <Link to="/policy" className="btn-ghost btn-sm mt-3">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {data.policyConfigured ? "Review the policy" : "Set the policy"}
            </Link>
          </Panel>

          <p className="px-1 text-2xs leading-relaxed text-faint">
            Batch <span className="font-mono text-muted">{data.batchId}</span>. Counts here are
            totals. Individual students' profiles, applications and notes are theirs and are not
            readable from this page.
          </p>
        </div>
      </div>
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
