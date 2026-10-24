import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarClock, Clock3, Pencil, SlidersHorizontal } from "lucide-react";
import { ApplicationControls } from "../components/application-controls";
import {
  ClashList,
  CriteriaTable,
  Empty,
  ErrorNote,
  Loading,
  Notice,
  Panel,
  PriorityBreakdown,
  StatusChip,
} from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { useBoard } from "../lib/use-board";
import { usePageMeta } from "../lib/use-page-meta";
import { formatIst, formatIstWindow, formatLpa, relativeToNow } from "../lib/format";

const ROUND_LABEL: Record<string, string> = {
  pre_placement_talk: "Pre-placement talk",
  online_test: "Online test",
  group_discussion: "Group discussion",
  technical_interview: "Technical interview",
  hr_interview: "HR interview",
  other: "Round",
};

const STATUS_WORD: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  in_progress: "In progress",
  offer: "Offer received",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function DriveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { board, loading, failure, reload } = useBoard();
  const { isOfficer } = useAuth();

  const all = board
    ? [
        ...board.groups.actionable,
        ...board.groups.unknown,
        ...board.groups.blocked,
        ...board.groups.notEligible,
        ...board.groups.expired,
        ...board.groups.resolved,
      ]
    : [];
  const view = all.find((v) => v.drive.id === id);

  usePageMeta(view ? view.drive.company : loading ? "Loading" : "Drive not found");

  if (loading) return <Loading label="Loading this drive" rows={2} />;
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

  if (!view) {
    return (
      <div className="py-10">
        <Empty
          title="That drive is not on your board"
          action={
            <Link to="/drives" className="btn-primary">
              Back to your drives
            </Link>
          }
        >
          It may have been removed by someone else in your batch, or the link may belong to a
          different college.
        </Empty>
      </div>
    );
  }

  const { drive, eligibility, policy, application, nextDate, status, createdByName } = view;
  const rounds = [...drive.rounds].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/drives"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All drives
        </Link>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-display truncate text-2xl font-semibold">{drive.company}</h1>
            <p className="mt-1 text-sm text-muted">
              {drive.role}
              <span className="mx-1.5 text-faint">·</span>
              <span className="tabular font-medium text-ink">{formatLpa(drive.ctcLpa)}</span>
              {drive.location && (
                <>
                  <span className="mx-1.5 text-faint">·</span>
                  {drive.location}
                </>
              )}
            </p>
            {createdByName && (
              <p className="mt-1 text-xs text-faint">Added by {createdByName}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            <StatusChip status={status} />
            {isOfficer && (
              <Link to={`/drives/${drive.id}/edit`} className="btn-ghost btn-sm">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Link>
            )}
          </div>
        </div>
      </div>

      {status === "blocked" && policy.reason && <Notice tone="info">{policy.reason}</Notice>}

      {status === "expired" && (
        <div className="rounded-xl border border-edge bg-card px-4 py-3 text-sm text-muted">
          The application deadline passed{" "}
          {drive.applicationDeadline ? relativeToNow(drive.applicationDeadline) : ""}. This drive is
          kept on the board for the record but is no longer ranked.
        </div>
      )}

      {eligibility.verdict === "unknown" && (
        <Notice tone="warn">
          This notice asks for something your profile does not have, so the verdict is undecided
          rather than guessed.{" "}
          <Link to="/profile" className="font-medium underline underline-offset-2">
            Complete your profile
          </Link>
          .
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Eligibility"
            subtitle="Every criterion the notice states, checked independently"
          >
            <CriteriaTable view={view} />
          </Panel>

          <Panel title="Rounds" subtitle="All times in IST">
            {rounds.length === 0 ? (
              <p className="text-sm text-muted">Dates to be announced.</p>
            ) : (
              <ol className="divide-y divide-edge">
                {rounds.map((round) => (
                  <li
                    key={round.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{round.name}</span>
                      <span className="ml-2 text-xs text-faint">
                        {ROUND_LABEL[round.type] ?? round.type}
                      </span>
                    </div>
                    <div className="tabular shrink-0 text-right text-xs text-muted">
                      <div>{formatIst(round.startAt)}</div>
                      <div className="text-faint">
                        {formatIstWindow(round.startAt, round.endAt)}
                        <span className="mx-1">·</span>
                        {relativeToNow(round.startAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {view.clashes.length > 0 && (
            <Panel title="Scheduling conflicts" subtitle="You cannot attend both">
              <ClashList view={view} />
            </Panel>
          )}

          <Panel
            title="Your status"
            subtitle="One application per drive, enforced by a unique index rather than by this form"
          >
            <ApplicationControls
              driveId={drive.id}
              driveCtcLpa={drive.ctcLpa}
              current={application?.status ?? null}
              currentRound={application?.currentRound ?? null}
              offerCtcLpa={application?.offerCtcLpa ?? null}
              onChanged={reload}
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          {view.priority && (
            <Panel title="Priority" subtitle="Why this ranks where it does">
              <PriorityBreakdown score={view.priority} />
            </Panel>
          )}

          <Panel title="Key dates">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  Application deadline
                </dt>
                <dd className="tabular mt-1">
                  {drive.applicationDeadline ? (
                    <>
                      {formatIst(drive.applicationDeadline)}
                      <span className="ml-1.5 text-faint">
                        {relativeToNow(drive.applicationDeadline)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">None stated</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Next for you
                </dt>
                <dd className="mt-1">
                  {nextDate ? (
                    <>
                      {nextDate.label}
                      <span className="tabular ml-1.5 text-muted">{formatIst(nextDate.at)}</span>
                      {nextDate.live && (
                        <span className="chip ml-2 bg-warn/12 text-warn">In progress now</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">Nothing scheduled</span>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>

          {application && application.history.length > 0 && (
            <Panel title="History" subtitle="Append-only: transitions are recorded, never rewritten">
              <ol className="space-y-2 text-sm">
                {[...application.history]
                  .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                  .map((entry, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3">
                      <span className="text-muted">{STATUS_WORD[entry.status]}</span>
                      <span className="tabular shrink-0 text-xs text-faint">
                        {formatIst(entry.at)}
                      </span>
                    </li>
                  ))}
              </ol>
            </Panel>
          )}

          <Panel title="Prepare for this role">
            <p className="text-sm text-muted">
              Paste the job description and get the skills it asks for, separated into required
              and preferred, with the line each one came from.
            </p>
            <Link
              to={`/prepare/${drive.id}?company=${encodeURIComponent(drive.company)}&role=${encodeURIComponent(drive.role)}`}
              className="btn-ghost mt-3 w-full"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Open preparation
            </Link>
          </Panel>

          {status === "actionable" && (
            <Panel title="Thinking about accepting?">
              <p className="text-sm text-muted">
                See exactly which other drives an offer here would close, before you reply.
              </p>
              <Link to={`/simulate?driveId=${drive.id}`} className="btn-ghost mt-3 w-full">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Simulate accepting
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
