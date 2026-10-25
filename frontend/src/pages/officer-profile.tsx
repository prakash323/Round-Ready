import { Link } from "react-router-dom";
import { Scale, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader, Panel } from "../components/ui";
import type { SessionUser } from "../lib/types";

/**
 * The CDC officer's account page.
 *
 * Not the student profile with fields hidden. A student's profile is an
 * eligibility record — CGPA, backlogs, branch, a secured placement — and
 * every one of those exists to decide which drives they may sit for. An
 * officer sits for none, so there is nothing on that form that means
 * anything to them, and showing it would imply their CGPA gates something.
 *
 * What is left is genuinely an account page: who they are, which batch they
 * administer, and what the role permits. It is read-only because nothing here
 * is editable today — the name and email come from registration, and the
 * batch from the college and year they registered with. Saying that plainly
 * is better than a disabled form that looks like it should work.
 */
export function OfficerProfilePage({ user }: { user: SessionUser }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Your account"
        description="You are signed in as a CDC officer for this batch."
      />

      <Panel title="Who you are">
        <dl className="divide-y divide-edge">
          <Line label="Name" value={user.name} />
          <Line label="Email" value={user.email} />
          <Line
            label="Role"
            value={
              <span className="chip bg-accent/12 text-accent">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                CDC officer
              </span>
            }
          />
          <Line
            label="Batch"
            value={<span className="font-mono text-xs text-muted">{user.batchId}</span>}
          />
        </dl>
        <p className="mt-3 text-2xs leading-relaxed text-faint">
          These come from the details you registered with and are not editable here.
        </p>
      </Panel>

      <Panel title="What this role can do">
        <ul className="space-y-2.5 text-sm leading-relaxed text-muted">
          <li className="flex items-start gap-2.5">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              Publish, edit and withdraw drives for this batch. Students can read them and
              cannot change them.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              Set the higher-offer multipliers that gate a placed student's board.{" "}
              <Link to="/policy" className="link">
                Batch policy
              </Link>
              .
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">Not</strong> read any individual student's
              profile, applications, study plan or notes. Those are theirs, and nothing in
              RoundReady exposes them to this account.
            </span>
          </li>
        </ul>
      </Panel>

      {/*
        Said explicitly rather than left as an absence. An officer looking for
        the CGPA form a classmate mentioned should find out why it is not
        here, not conclude the page is broken.
      */}
      <Panel title="Why there are no academic fields">
        <p className="text-sm leading-relaxed text-muted">
          A student's profile holds their CGPA, active backlogs, branch and any placement they
          have accepted. Every one of those exists to decide which drives they may sit for. You do
          not sit for drives, so there is nothing to record — and a CGPA on this page would imply
          it gated something, which it would not.
        </p>
      </Panel>
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{value}</dd>
    </div>
  );
}
