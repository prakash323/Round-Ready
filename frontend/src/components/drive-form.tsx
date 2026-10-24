import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { send } from "../lib/api";
import { istInputToUtc, istInputValue } from "../lib/format";
import { Field, FormStatus } from "./field";
import type { Criteria, RoundType } from "../lib/types";

/**
 * Entering a drive from a TPO notice.
 *
 * Every criterion is optional, and the form says so, because that is how
 * notices are written: most mention a CGPA cutoff and a branch list and nothing
 * else. A blank box is stored as "not specified" and is then never evaluated —
 * it does not become a zero cutoff that silently passes everybody.
 */

const ROUND_TYPES: { value: RoundType; label: string }[] = [
  { value: "pre_placement_talk", label: "Pre-placement talk" },
  { value: "online_test", label: "Online test" },
  { value: "group_discussion", label: "Group discussion" },
  { value: "technical_interview", label: "Technical interview" },
  { value: "hr_interview", label: "HR interview" },
  { value: "other", label: "Other" },
];

interface RoundDraft {
  key: string;
  name: string;
  type: RoundType;
  startAt: string;
  endAt: string;
}

export interface DriveFormValues {
  company: string;
  role: string;
  ctcLpa: number | string;
  location: string;
  applicationDeadline: string;
  criteria: Criteria;
  rounds: { name: string; type: RoundType; startAt: string; endAt: string }[];
}

export const BLANK_DRIVE: DriveFormValues = {
  company: "",
  role: "",
  ctcLpa: "",
  location: "",
  applicationDeadline: "",
  criteria: {
    cgpaMin: null,
    maxActiveBacklogs: null,
    allowedBranches: [],
    tenthPercentMin: null,
    twelfthPercentMin: null,
    gapYearsAllowed: null,
  },
  rounds: [],
};

let seq = 0;
const nextKey = () => `r${(seq += 1)}`;

export function DriveForm({
  initial = BLANK_DRIVE,
  driveId,
}: {
  initial?: DriveFormValues;
  driveId?: string;
}) {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundDraft[]>(
    initial.rounds.map((r) => ({
      key: nextKey(),
      name: r.name,
      type: r.type,
      startAt: r.startAt ? istInputValue(r.startAt) : "",
      endAt: r.endAt ? istInputValue(r.endAt) : "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  // Matched against the saved company name rather than the live input, because
  // that is the record being destroyed. Falls back to "delete" so a drive saved
  // with a blank company cannot be removed by confirming nothing.
  const confirmWord = initial.company.trim() || "delete";
  const confirmed = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  function patchRound(key: string, change: Partial<RoundDraft>) {
    setRounds((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A second submit while the first is in flight would create the drive twice.
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const num = (name: string) => {
      const value = text(name);
      return value === "" ? null : Number(value);
    };

    /**
     * A datetime the browser gave us but `istInputToUtc` cannot read is a
     * client-side error, surfaced against the field. Posting the `null` it
     * returns used to be accepted by the API and stored as 1 January 1970
     * (AUDIT.md D4) — now the API rejects it, so catching it here is what turns
     * a confusing 422 into a message next to the input.
     */
    const localFieldErrors: Record<string, string> = {};

    const deadlineLocal = text("applicationDeadline");
    let applicationDeadline: string | null = null;
    if (deadlineLocal !== "") {
      applicationDeadline = istInputToUtc(deadlineLocal);
      if (applicationDeadline === null) {
        localFieldErrors.applicationDeadline = "That is not a date and time we can read";
      }
    }

    const usable = rounds.filter((r) => r.name.trim() || r.startAt || r.endAt);
    const payloadRounds: { name: string; type: RoundType; startAt: string; endAt: string }[] = [];
    /** The same rounds, keyed back to the row on screen, for the overlap check. */
    const placed: { formIndex: number; name: string; startAt: string; endAt: string }[] = [];

    usable.forEach((r, index) => {
      const start = r.startAt ? istInputToUtc(r.startAt) : null;
      const end = r.endAt ? istInputToUtc(r.endAt) : null;
      if (!r.name.trim()) localFieldErrors[`rounds.${index}.name`] = "Round name is required";
      if (start === null) localFieldErrors[`rounds.${index}.startAt`] = "Enter a date and time";
      if (end === null) localFieldErrors[`rounds.${index}.endAt`] = "Enter a date and time";
      // The server rejects this too. Checking it here as well saves a round
      // trip for a mistake that is visible on the screen the officer is
      // already looking at.
      if (start !== null && end !== null && new Date(end) <= new Date(start)) {
        localFieldErrors[`rounds.${index}.endAt`] = "A round must end after it starts";
      }
      if (start !== null && end !== null && r.name.trim()) {
        // The form index is carried alongside, because `payloadRounds` skips
        // incomplete rows — so its positions drift from the rows on screen,
        // and an error keyed by the wrong one points at an innocent round.
        placed.push({ formIndex: index, name: r.name.trim(), startAt: start, endAt: end });
        payloadRounds.push({ name: r.name.trim(), type: r.type, startAt: start, endAt: end });
      }
    });

    /**
     * Rounds that overlap each other on the same drive.
     *
     * Half-open, matching the engine and the server schema: rounds that merely
     * touch are fine, because back-to-back rounds are completely ordinary. A
     * drive that genuinely clashes with itself reaches the board as a
     * scheduling conflict the student has no way to resolve, so it is caught
     * while the person who can fix it is still looking at it.
     */
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        if (a.startAt < b.endAt && a.endAt > b.startAt) {
          localFieldErrors[`rounds.${b.formIndex}.startAt`] =
            `This overlaps "${a.name}" on this drive`;
        }
      }
    }

    if (Object.keys(localFieldErrors).length > 0) {
      setBusy(false);
      setFields(localFieldErrors);
      setMessage("Some fields need fixing");
      return;
    }

    const body = {
      company: text("company"),
      role: text("role"),
      ctcLpa: text("ctcLpa"),
      location: text("location") || null,
      applicationDeadline,
      criteria: {
        cgpaMin: num("cgpaMin"),
        maxActiveBacklogs: num("maxActiveBacklogs"),
        // "CSE, IT, ECE" from the notice, split and trimmed. Left blank, the
        // list stays empty, which the engine reads as "every branch".
        allowedBranches: text("allowedBranches")
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean),
        tenthPercentMin: num("tenthPercentMin"),
        twelfthPercentMin: num("twelfthPercentMin"),
        gapYearsAllowed: num("gapYearsAllowed"),
      },
      rounds: payloadRounds,
    };

    const { data, failure } = await send<{ drive: { _id: string } }>(
      driveId ? `/api/drives/${driveId}` : "/api/drives",
      driveId ? "PATCH" : "POST",
      body,
    );
    setBusy(false);

    if (failure) {
      setMessage(failure.message);
      setFields(failure.fields);
      return;
    }
    navigate(driveId ? `/drives/${driveId}` : `/drives/${data?.drive._id ?? ""}`);
  }

  async function remove() {
    if (!driveId || !confirmed) return;
    setBusy(true);
    setMessage(null);
    const { failure } = await send(`/api/drives/${driveId}`, "DELETE");
    setBusy(false);
    if (failure) {
      setConfirming(false);
      setTyped("");
      setMessage(failure.message);
      return;
    }
    navigate("/drives");
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">The drive</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Company"
            name="company"
            defaultValue={initial.company}
            error={fields.company}
            required
          />
          <Field
            label="Role"
            name="role"
            defaultValue={initial.role}
            placeholder="Software Engineer"
            error={fields.role}
            required
          />
          <Field
            label="CTC (LPA)"
            name="ctcLpa"
            type="number"
            step="0.1"
            min={0}
            max={500}
            defaultValue={initial.ctcLpa}
            error={fields.ctcLpa}
            required
          />
          <Field
            label="Location"
            name="location"
            defaultValue={initial.location}
            error={fields.location}
          />
          <Field
            label="Application deadline"
            name="applicationDeadline"
            type="datetime-local"
            defaultValue={
              initial.applicationDeadline ? istInputValue(initial.applicationDeadline) : ""
            }
            error={fields.applicationDeadline}
            hint="In IST. Leave blank if the notice gives none."
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Eligibility criteria</h2>
          <p className="mt-0.5 text-xs text-faint">
            Copy only what the notice states. Anything you leave blank is not checked at all.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum CGPA"
            name="cgpaMin"
            type="number"
            step="0.01"
            min={0}
            max={10}
            defaultValue={initial.criteria.cgpaMin ?? ""}
            error={fields["criteria.cgpaMin"]}
          />
          <Field
            label="Maximum active backlogs"
            name="maxActiveBacklogs"
            type="number"
            min={0}
            max={50}
            defaultValue={initial.criteria.maxActiveBacklogs ?? ""}
            error={fields["criteria.maxActiveBacklogs"]}
          />
          <Field
            label="Allowed branches"
            name="allowedBranches"
            defaultValue={initial.criteria.allowedBranches.join(", ")}
            placeholder="CSE, IT, ECE"
            hint="Comma separated. Blank means all branches."
            error={fields["criteria.allowedBranches"]}
          />
          <Field
            label="Gap years allowed"
            name="gapYearsAllowed"
            type="number"
            min={0}
            max={10}
            defaultValue={initial.criteria.gapYearsAllowed ?? ""}
            error={fields["criteria.gapYearsAllowed"]}
          />
          <Field
            label="Minimum 10th %"
            name="tenthPercentMin"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={initial.criteria.tenthPercentMin ?? ""}
            error={fields["criteria.tenthPercentMin"]}
          />
          <Field
            label="Minimum 12th %"
            name="twelfthPercentMin"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={initial.criteria.twelfthPercentMin ?? ""}
            error={fields["criteria.twelfthPercentMin"]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Rounds</h2>
            <p className="mt-0.5 text-xs text-faint">
              Times in IST. These are what clash detection runs on.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() =>
              setRounds((list) => [
                ...list,
                { key: nextKey(), name: "", type: "online_test", startAt: "", endAt: "" },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add a round
          </button>
        </div>

        {rounds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-edge px-4 py-5 text-center text-xs text-faint">
            No rounds yet. A drive with none shows &ldquo;dates to be announced&rdquo; — that is a
            valid state, not an error.
          </p>
        ) : (
          <ul className="space-y-3">
            {rounds.map((round, index) => (
              <li key={round.key} className="panel-flush p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="label" htmlFor={`round-name-${round.key}`}>
                      Name
                    </label>
                    <input
                      id={`round-name-${round.key}`}
                      className="field"
                      value={round.name}
                      placeholder="Online assessment"
                      onChange={(event) => patchRound(round.key, { name: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`round-type-${round.key}`}>
                      Type
                    </label>
                    <select
                      id={`round-type-${round.key}`}
                      className="field"
                      value={round.type}
                      onChange={(event) =>
                        patchRound(round.key, { type: event.target.value as RoundType })
                      }
                    >
                      {ROUND_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`round-start-${round.key}`}>
                      Starts (IST)
                    </label>
                    <input
                      id={`round-start-${round.key}`}
                      className="field"
                      type="datetime-local"
                      value={round.startAt}
                      onChange={(event) => patchRound(round.key, { startAt: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`round-end-${round.key}`}>
                      Ends (IST)
                    </label>
                    <input
                      id={`round-end-${round.key}`}
                      className="field"
                      type="datetime-local"
                      value={round.endAt}
                      onChange={(event) => patchRound(round.key, { endAt: event.target.value })}
                    />
                  </div>
                </div>
                <div aria-live="polite">
                  {(["name", "startAt", "endAt"] as const).map((key) =>
                    fields[`rounds.${index}.${key}`] ? (
                      <p key={key} className="mt-2 text-xs text-bad">
                        {fields[`rounds.${index}.${key}`]}
                      </p>
                    ) : null,
                  )}
                </div>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-bad"
                  onClick={() => setRounds((list) => list.filter((r) => r.key !== round.key))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove this round
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormStatus error={message} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy ? "Saving…" : driveId ? "Save changes" : "Add drive"}
        </button>
        {driveId && !confirming && (
          <button
            type="button"
            className="btn-ghost hover:border-bad/50 hover:text-bad"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Delete drive
          </button>
        )}
      </div>

      {/* A drive is shared, the delete is irreversible from the student's point
          of view, and it takes their application record with it — so it asks
          for the company name rather than trusting one click not to have been a
          misclick (AUDIT.md D2). */}
      {driveId && confirming && (
        <div className="animate-slide-up rounded-xl border border-bad/35 bg-bad/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-bad">
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Delete {initial.company.trim() || "this drive"} for the whole batch?
          </h2>
          <p className="mt-1 text-xs text-muted">
            This drive is shared. Deleting it removes it from every student&rsquo;s board in your
            batch. There is no undo in the app. If the notice was only corrected, edit the drive
            instead.
          </p>

          <label className="label mt-4" htmlFor="confirmDelete">
            Type <span className="font-mono normal-case text-muted">{confirmWord}</span> to confirm
          </label>
          <input
            id="confirmDelete"
            className="field sm:w-72"
            value={typed}
            autoComplete="off"
            placeholder={confirmWord}
            onChange={(event) => setTyped(event.target.value)}
            // Enter inside the form would otherwise save the drive, and a
            // destructive action should not be reachable from a stray keypress.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-danger"
              onClick={remove}
              disabled={busy || !confirmed}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? "Deleting…" : "Delete this drive"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
