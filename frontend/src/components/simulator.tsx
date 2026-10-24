import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, TrendingDown, TriangleAlert } from "lucide-react";
import { send } from "../lib/api";
import { formatIst, formatLpa } from "../lib/format";
import { FormStatus } from "./field";
import { Empty } from "./ui";
import type { AffectedDrive, DriveStatus, Simulation } from "../lib/types";

/**
 * "What does accepting this cost me?"
 *
 * The screen is deliberately blunt: a verdict, the arithmetic behind it, and
 * the named list of companies that would close. It ends by saying the decision
 * is not the tool's to make, because risk appetite and how much a student
 * wants a particular company are not in the data model.
 *
 * Every number comes from `POST /api/simulate`. Nothing is recomputed here,
 * and the request writes nothing.
 */

export interface Candidate {
  id: string;
  company: string;
  role: string;
  ctcLpa: number;
  status: DriveStatus;
}

const VERDICT = {
  safe: {
    label: "Low cost",
    className: "border-ok/30 bg-ok/5",
    text: "text-ok",
    Icon: CheckCircle2,
  },
  consider: {
    label: "Worth thinking about",
    className: "border-warn/30 bg-warn/5",
    text: "text-warn",
    Icon: TriangleAlert,
  },
  costly: {
    label: "Expensive",
    className: "border-bad/30 bg-bad/5",
    text: "text-bad",
    Icon: TrendingDown,
  },
};

export function Simulator({
  candidates,
  initialDriveId,
}: {
  candidates: Candidate[];
  initialDriveId?: string;
}) {
  const preset = candidates.find((c) => c.id === initialDriveId) ?? candidates[0];
  const [driveId, setDriveId] = useState(preset?.id ?? "");
  const [offer, setOffer] = useState(String(preset?.ctcLpa ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Simulation | null>(null);

  const selected = candidates.find((c) => c.id === driveId);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { data, failure } = await send<{ simulation: Simulation }>("/api/simulate", "POST", {
      driveId,
      offerCtcLpa: offer === "" ? null : offer,
    });
    setBusy(false);
    if (failure || !data) {
      setMessage(failure?.message ?? "Could not run the simulation");
      setResult(null);
      return;
    }
    setResult(data.simulation);
  }

  if (candidates.length === 0) {
    return (
      <div className="panel px-4 py-5">
        <Empty title="Nothing to simulate yet">
          Add a drive you are eligible for, and come back when an offer is on the table.
        </Empty>
      </div>
    );
  }

  const verdict = result ? VERDICT[result.verdict] : null;

  return (
    <div className="space-y-5">
      <div className="panel p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
          <div className="min-w-0">
            <label className="label" htmlFor="driveId">
              If I accept
            </label>
            <select
              id="driveId"
              className="field"
              value={driveId}
              onChange={(event) => {
                setDriveId(event.target.value);
                const next = candidates.find((c) => c.id === event.target.value);
                if (next) setOffer(String(next.ctcLpa));
                setResult(null);
              }}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} — {c.role} ({c.ctcLpa} LPA)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="offerCtc">
              At (LPA)
            </label>
            <input
              id="offerCtc"
              className="field tabular"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              value={offer}
              onChange={(event) => {
                setOffer(event.target.value);
                setResult(null);
              }}
            />
          </div>
          <button
            type="button"
            className="btn-primary h-[2.4rem]"
            onClick={run}
            disabled={busy || !driveId}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Working…" : "What would it cost?"}
          </button>
        </div>

        {selected?.status === "resolved" && (
          <p className="mt-3 text-xs text-faint">
            You already hold an outcome on this drive. The simulation still shows what the
            acceptance implies.
          </p>
        )}
        {message && (
          <div className="mt-3">
            <FormStatus error={message} />
          </div>
        )}
      </div>

      {result && verdict && (
        <div className="animate-slide-up space-y-5">
          <div className={`rounded-xl border p-4 sm:p-5 ${verdict.className}`}>
            <div className={`flex items-center gap-2 ${verdict.text}`}>
              <verdict.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {verdict.label}
              </span>
            </div>
            <h2 className="mt-2 text-base font-semibold sm:text-lg">{result.headline}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              {result.rationale.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Drives that close" value={result.closes.length} tone="bad" />
            <Metric label="Drives that survive" value={result.survives.length} tone="ok" />
            <Metric
              label="Best forgone premium"
              value={result.ctcForegone > 0 ? `+${formatLpa(result.ctcForegone)}` : "—"}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <AffectedList
              title={`Closes (${result.closes.length})`}
              note="Eligible, still open to you, and gone the moment you accept."
              items={result.closes}
              tone="bad"
            />
            <AffectedList
              title={`Stays open (${result.survives.length})`}
              note={
                result.floorLpa !== null
                  ? `Above the ${result.floorLpa} LPA line this acceptance would draw.`
                  : "Your policy does not close these."
              }
              items={result.survives}
              tone="ok"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  tone?: "ink" | "ok" | "bad";
}) {
  const colour = { ink: "text-ink", ok: "text-ok", bad: "text-bad" }[tone];
  return (
    <div className="panel px-4 py-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`tabular mt-1.5 text-2xl font-semibold ${colour}`}>{value}</div>
    </div>
  );
}

function AffectedList({
  title,
  note,
  items,
  tone,
}: {
  title: string;
  note: string;
  items: AffectedDrive[];
  tone: "ok" | "bad";
}) {
  return (
    <section className="panel">
      <header className="border-b border-edge px-4 py-3 sm:px-5">
        <h3 className={`text-sm font-semibold ${tone === "ok" ? "text-ok" : "text-bad"}`}>
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{note}</p>
      </header>
      <div className="px-4 py-1 sm:px-5">
        {items.length === 0 ? (
          <p className="py-3 text-sm text-muted">None.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {items.map((item) => (
              <li
                key={item.driveId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <Link
                    to={`/drives/${item.driveId}`}
                    className="text-sm font-medium hover:text-accent"
                  >
                    {item.company}
                  </Link>
                  <span className="ml-2 text-xs text-faint">{item.role}</span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-sm font-medium">{formatLpa(item.ctcLpa)}</div>
                  {item.nextDate && (
                    <div className="tabular text-2xs text-faint">{formatIst(item.nextDate)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
