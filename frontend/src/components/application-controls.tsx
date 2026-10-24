import { useState } from "react";
import { Loader2 } from "lucide-react";
import { send } from "../lib/api";
import { FormStatus } from "./field";

/**
 * Advancing an application.
 *
 * Recording an offer asks for the amount, because the placement gate cannot be
 * evaluated without it — the schema rejects an offer with no CTC rather than
 * defaulting to zero and quietly unblocking the whole board.
 */

const STATUSES = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "in_progress", label: "In progress" },
  { value: "offer", label: "Offer received" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApplicationControls({
  driveId,
  driveCtcLpa,
  current,
  currentRound,
  offerCtcLpa,
  onChanged,
}: {
  driveId: string;
  driveCtcLpa: number;
  current: string | null;
  currentRound: string | null;
  offerCtcLpa: number | null;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState(current ?? "");
  const [offer, setOffer] = useState(String(offerCtcLpa ?? driveCtcLpa));
  const [round, setRound] = useState(currentRound ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { failure } = await send("/api/applications", "PUT", {
      driveId,
      status: next,
      currentRound: round || null,
      offerCtcLpa: next === "offer" ? offer : null,
    });
    setBusy(false);
    if (failure) {
      setMessage(failure.message);
      return;
    }
    setStatus(next);
    onChanged();
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { failure } = await send(`/api/applications?driveId=${driveId}`, "DELETE");
    setBusy(false);
    if (failure) {
      setMessage(failure.message);
      return;
    }
    setStatus("");
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Your status on this drive" className="flex flex-wrap gap-2">
        {STATUSES.map((option) => {
          const active = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => {
                if (option.value === "offer") {
                  setStatus("offer-draft");
                  return;
                }
                void save(option.value);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-50 ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-edge text-muted hover:border-faint/60 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {status === "offer-draft" && (
        <div className="animate-slide-up rounded-lg border border-accent/35 bg-accent/5 p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="offerCtc">
                Offered CTC (LPA)
              </label>
              <input
                id="offerCtc"
                className="field tabular w-36"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={offer}
                onChange={(event) => setOffer(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void save("offer")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Record the offer
            </button>
            <button type="button" className="btn-ghost" onClick={() => setStatus(current ?? "")}>
              Cancel
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Recording an offer re-gates every other drive according to your placement policy. Run
            the simulator first if you have not decided.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label className="label" htmlFor="currentRound">
            Current round
            <span className="ml-1.5 font-normal text-faint">Optional</span>
          </label>
          <input
            id="currentRound"
            className="field"
            value={round}
            placeholder="Technical interview 2"
            aria-describedby="currentRound-hint"
            onChange={(event) => setRound(event.target.value)}
            onBlur={() => {
              if (status && status !== "offer-draft") void save(status);
            }}
          />
          <p id="currentRound-hint" className="mt-1.5 text-xs text-faint">
            Saved when you click away.
          </p>
        </div>
        {status && status !== "offer-draft" && (
          <button type="button" className="btn-ghost mb-7" disabled={busy} onClick={clear}>
            Clear my status
          </button>
        )}
      </div>

      <FormStatus error={message} />
    </div>
  );
}
