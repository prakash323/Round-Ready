import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Clock3, Plus } from "lucide-react";
import {
  DriveCard,
  Empty,
  ErrorNote,
  Loading,
  Notice,
  PageHeader,
  Panel,
  PriorityBreakdown,
  Stat,
  counterpartOf,
} from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { useBoard } from "../lib/use-board";
import { usePageMeta } from "../lib/use-page-meta";
import {
  formatIst,
  formatIstDate,
  formatIstWindow,
  formatLpa,
  istDayKey,
  relativeToNow,
} from "../lib/format";

export function DashboardPage() {
  const { user, isOfficer } = useAuth();
  const { board, loading, failure, reload } = useBoard();
  usePageMeta("Overview");

  const firstName = (user?.name ?? "").split(" ")[0] || "there";

  if (loading) return <Loading label="Building your board" rows={2} />;
  if (failure) {
    return (
      <ErrorNote
        message={failure.message}
        action={
          <button type="button" className="btn-ghost btn-sm" onClick={reload}>
            Try again
          </button>
        }
      />
    );
  }
  if (!board) return <ErrorNote message="The board could not be loaded." />;

  const { stats, groups } = board;

  if (!board.profileIsUsable) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={formatIstDate(new Date())}
          title={`Hello, ${firstName}`}
          description="One thing first."
        />
        <Panel title="Your profile decides every verdict on this board">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Eligibility is computed against your CGPA, active backlogs and branch. Without them
            every drive comes back as <span className="font-medium text-warn">cannot determine</span>{" "}
            — which is honest, but not useful. It takes about a minute.
          </p>
          <Link to="/profile" className="btn-primary mt-4">
            Set up my profile
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Panel>
      </div>
    );
  }

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

      {board.policyWarning && <Notice tone="warn">{board.policyWarning}</Notice>}

      {board.securedPlacement && board.securedThresholdLpa !== null && (
        <Notice tone="info">
          You have secured{" "}
          <span className="font-medium">{board.securedPlacement.company}</span> at{" "}
          <span className="tabular">{board.securedPlacement.ctcLpa} LPA</span> (
          {board.securedPlacement.category === "service_based" ? "service-based" : "product-based"}
          ), so a further drive must pay at least{" "}
          <span className="tabular font-medium">
            {board.securedMultiplier}× that — {board.securedThresholdLpa} LPA
          </span>
          .{" "}
          <Link to="/profile" className="font-medium underline underline-offset-2">
            Change it
          </Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Eligible" value={stats.actionable} tone="ok" />
        <Stat label="Due" value={stats.dueThisWeek} hint="next 7 days" tone="info" />
        <Stat label="Clashes" value={stats.clashes} tone={stats.clashes > 0 ? "warn" : "ink"} />
        <Stat label="Blocked" value={stats.blocked} tone="info" />
        <Stat label="Not eligible" value={stats.notEligible} tone="bad" />
        <Stat
          label="Best open"
          value={stats.bestAvailableCtcLpa ? formatLpa(stats.bestAvailableCtcLpa) : "—"}
        />
      </div>

      {stats.total === 0 ? (
        <Panel>
          {/* Two different next steps, because the two roles have two
              different ones. Telling a student to "add your first drive"
              points them at a button they do not have. */}
          <Empty
            title={isOfficer ? "Add your first drive" : "No drives yet"}
            action={
              isOfficer ? (
                <Link to="/drives/new" className="btn-primary">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add a drive
                </Link>
              ) : undefined
            }
          >
            {isOfficer
              ? "Open the TPO notice beside you and enter the company, the CTC and the eligibility criteria exactly as written. The board does the rest, and everyone in your batch sees it too."
              : "Your placement office has not posted any drives yet. When they do, they will appear here with your eligibility for each one already worked out. In the meantime, filling in your profile means the board can answer the moment the first one lands."}
          </Empty>
        </Panel>
      ) : (
        <>
          {stats.offers > 0 && (
            <Panel
              title="You are holding an offer"
              subtitle="Check what accepting would close before you reply"
              action={
                <Link to="/simulate" className="btn-primary btn-sm">
                  Run the simulator
                </Link>
              }
            >
              <p className="text-sm text-muted">
                {stats.blocked} drive{stats.blocked === 1 ? "" : "s"} on your board
                {stats.blocked === 1 ? " is" : " are"} already blocked by your placement policy.
              </p>
            </Panel>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Panel
              title="The next seven days"
              subtitle="Deadlines and rounds on drives you can still act on"
              bodyClassName="py-1"
              action={
                <Link to="/calendar" className="link text-xs">
                  Full calendar
                </Link>
              }
            >
              {board.agenda.length === 0 ? (
                <div className="py-3">
                  <Empty>Nothing scheduled in the next seven days.</Empty>
                </div>
              ) : (
                <ol className="divide-y divide-edge">
                  {board.agenda.map((item, i) => (
                    <li
                      key={`${item.driveId}-${item.label}-${i}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/drives/${item.driveId}`}
                          className="text-sm font-medium hover:text-accent"
                        >
                          {item.company}
                        </Link>
                        <span className="ml-2 text-xs text-muted">{item.label}</span>
                        {item.clashing && (
                          <span className="chip ml-2 bg-warn/12 text-warn">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Clash
                          </span>
                        )}
                        {item.kind === "deadline" && (
                          <span className="chip ml-2 bg-info/12 text-info">Deadline</span>
                        )}
                      </div>
                      <div className="tabular shrink-0 text-right text-xs text-muted">
                        <div>{formatIst(item.at)}</div>
                        <div className="text-faint">{relativeToNow(item.at)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel
              title="Where your next four hours should go"
              subtitle="Ranked, with the arithmetic shown"
              action={
                <Link to="/drives" className="link text-xs">
                  All drives
                </Link>
              }
            >
              {groups.actionable.length === 0 ? (
                <Empty>
                  Nothing is open to you right now. The blocked and not-eligible groups on the
                  drives page carry the reasons.
                </Empty>
              ) : (
                <ol className="space-y-4">
                  {groups.actionable.slice(0, 3).map((view, index) => (
                    <li
                      key={view.drive.id}
                      className={index > 0 ? "border-t border-edge pt-4" : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/drives/${view.drive.id}`}
                            className="block truncate text-sm font-semibold hover:text-accent"
                          >
                            {view.drive.company}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {view.drive.role} · {formatLpa(view.drive.ctcLpa)}
                          </p>
                        </div>
                        <span
                          aria-hidden="true"
                          className="chip shrink-0 bg-edge/60 text-muted tabular"
                        >
                          #{index + 1}
                        </span>
                      </div>
                      {view.priority && (
                        <div className="mt-3">
                          <PriorityBreakdown score={view.priority} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {board.clashes.length > 0 && (
            <Panel
              title={`${board.clashes.length} scheduling conflict${board.clashes.length === 1 ? "" : "s"}`}
              subtitle="Two things you cannot both attend"
            >
              <ul className="grid gap-3 md:grid-cols-2">
                {board.clashes.map((clash, i) => {
                  const a = clash.a;
                  const b = counterpartOf(clash, a.driveId);
                  const sameDay = istDayKey(a.startAt) === istDayKey(b.startAt);
                  return (
                    <li
                      key={i}
                      className="rounded-lg border border-warn/25 bg-warn/5 px-3.5 py-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">
                            {a.company} · {a.roundName}
                            <span className="font-normal text-faint"> vs </span>
                            {b.company} · {b.roundName}
                          </p>
                          <p className="tabular mt-1 text-xs text-muted">
                            {sameDay
                              ? `${formatIst(a.startAt).split(",").slice(0, 2).join(",")} — ${formatIstWindow(a.startAt, a.endAt)} against ${formatIstWindow(b.startAt, b.endAt)}`
                              : `${formatIst(a.startAt)} against ${formatIst(b.startAt)}`}
                            , overlapping by {clash.overlapMinutes} minutes
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {groups.unknown.length > 0 && (
            <Panel
              title={`${groups.unknown.length} drive${groups.unknown.length === 1 ? "" : "s"} cannot be decided`}
              subtitle="These notices ask for a field your profile does not have"
              action={
                <Link to="/profile" className="link text-xs">
                  Complete profile
                </Link>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.unknown.map((view) => (
                  <DriveCard key={view.drive.id} view={view} />
                ))}
              </div>
            </Panel>
          )}

          <p className="flex items-center gap-2 text-xs text-faint">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Every verdict here is recomputed from your profile on each load — nothing is cached.
          </p>
        </>
      )}
    </div>
  );
}
