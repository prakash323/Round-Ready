import { Link, useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";
import { Simulator } from "../components/simulator";
import type { Candidate } from "../components/simulator";
import { ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { useBoard } from "../lib/use-board";
import { usePageMeta } from "../lib/use-page-meta";

const POLICY_COPY: Record<string, string> = {
  none: "Your profile says your college places no restriction on further drives after an offer, so nothing here will close anything. If that is wrong, set the policy on your profile first.",
  one_offer:
    "Your college runs a one-offer policy: accepting anything ends your season. Every other drive you are eligible for will close.",
  dream_threshold:
    "Your college runs a dream-threshold policy: accepting draws a CTC line, and only drives above it stay open.",
};

export function SimulatePage() {
  const [params] = useSearchParams();
  const driveId = params.get("driveId") ?? undefined;
  const { board, loading, failure, reload } = useBoard();
  usePageMeta("Offer simulator");

  if (loading) return <Loading label="Loading your board" rows={2} />;
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

  // Anything you could plausibly be offered: a drive that is open to you, or
  // one you are already holding an outcome on.
  const candidates: Candidate[] = [
    ...board.groups.actionable,
    ...board.groups.unknown,
    ...board.groups.resolved,
  ].map((view) => ({
    id: view.drive.id,
    company: view.drive.company,
    role: view.drive.role,
    ctcLpa: view.drive.ctcLpa,
    status: view.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offer simulator"
        description="An offer usually comes with 48 hours to decide, and the question nobody can answer from a spreadsheet is what saying yes closes. This runs your whole board against the hypothetical and names the companies."
      />

      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-info">
          {POLICY_COPY[board.policy]}
          {board.policy === "dream_threshold" && board.dreamCtcLpa !== null && (
            <> Your dream cutoff is {board.dreamCtcLpa} LPA.</>
          )}{" "}
          <Link to="/profile" className="font-medium underline underline-offset-2">
            Change it
          </Link>
        </p>
      </div>

      {board.securedPlacement && board.securedThresholdLpa !== null && (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-info">
            You are already placed at {board.securedPlacement.company} (
            {board.securedPlacement.ctcLpa} LPA), so drives below{" "}
            <span className="tabular font-medium">{board.securedThresholdLpa} LPA</span> are
            already closed to you and are not counted as a cost below.
          </p>
        </div>
      )}

      <Simulator candidates={candidates} initialDriveId={driveId} />

      <Panel title="How this works">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted">
          <p>
            The board is built twice — once as things stand, once with the offer accepted — and the
            difference is reported. Nothing is written: no transaction, no rollback, no chance of a
            hypothetical leaking into your real record. That is only possible because every verdict
            is derived rather than stored.
          </p>
          <p>
            Drives you were never eligible for are not counted as a cost, and neither are drives
            whose deadline has already passed. Both would inflate the number and neither is
            something you could actually have had.
          </p>
          <p className="text-faint">
            This is arithmetic, not advice. A sure offer now against uncertain drives later is your
            call.
          </p>
        </div>
      </Panel>
    </div>
  );
}
