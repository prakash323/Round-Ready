import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { get, send } from "../lib/api";
import { Field, FormStatus } from "../components/field";
import { ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { BatchPolicy } from "../lib/types";

/**
 * The batch's higher-offer policy, as the CDC officer sets it.
 *
 * One screen, two numbers, and a worked example underneath each — because the
 * officer is not setting a multiplier, they are deciding which drives three
 * hundred placed students may still sit for. "1.5" is abstract; "a student
 * placed at 6 LPA needs 9 LPA" is the thing they can check against the
 * printed policy on their desk.
 */

/** The same bounds the server enforces, so the form agrees with the 422. */
const MIN = 1;
const MAX = 10;

function worked(secured: number, multiplier: number): string {
  const threshold = Math.round(secured * multiplier * 100) / 100;
  return `placed at ${secured} LPA → needs ${threshold} LPA`;
}

export function PolicyPage() {
  usePageMeta("Batch policy", "Set the higher-offer multipliers for your batch.");

  const [policy, setPolicy] = useState<BatchPolicy | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const { data, failure: f } = await get<{ policy: BatchPolicy }>("/api/policy");
      if (f || !data) {
        setFailure(f?.message ?? "The batch policy could not be loaded.");
        return;
      }
      setPolicy(data.policy);
      setService(String(data.policy.serviceMultiplier));
      setProduct(String(data.policy.productMultiplier));
    })();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(null);
    setFields({});

    const { data, failure: f } = await send<{ policy: BatchPolicy }>("/api/policy", "PUT", {
      serviceMultiplier: service,
      productMultiplier: product,
    });
    setBusy(false);

    if (f || !data) {
      setFailure(f?.message ?? "That could not be saved.");
      setFields(f?.fields ?? {});
      return;
    }
    setFailure(null);
    setPolicy(data.policy);
    setSaved("Saved. Every placed student's board is gated by these numbers from now on.");
  }

  if (failure && !policy) return <ErrorNote message={failure} />;
  if (!policy) return <Loading label="Loading the batch policy" rows={2} />;

  const serviceNum = Number(service);
  const productNum = Number(product);
  const serviceOk = Number.isFinite(serviceNum) && serviceNum >= MIN && serviceNum <= MAX;
  const productOk = Number.isFinite(productNum) && productNum >= MIN && productNum <= MAX;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch policy"
        description="What a student who has already accepted a placement must be offered before they may sit for anything further."
      />

      <Panel
        title="Higher-offer multipliers"
        subtitle={
          policy.configured
            ? `Last changed ${new Date(policy.updatedAt ?? "").toLocaleString()}`
            : "Nobody has set these yet, so your batch is on the standard numbers."
        }
      >
        <form onSubmit={save} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Field
                label="Service-based"
                name="serviceMultiplier"
                type="number"
                inputMode="decimal"
                step="0.05"
                min={MIN}
                max={MAX}
                value={service}
                onChange={setService}
                error={fields.serviceMultiplier}
                required
              />
              <p className="mt-1.5 text-xs text-faint">
                {serviceOk ? worked(6, serviceNum) : `Between ${MIN} and ${MAX}`}
              </p>
            </div>
            <div>
              <Field
                label="Product-based"
                name="productMultiplier"
                type="number"
                inputMode="decimal"
                step="0.05"
                min={MIN}
                max={MAX}
                value={product}
                onChange={setProduct}
                error={fields.productMultiplier}
                required
              />
              <p className="mt-1.5 text-xs text-faint">
                {productOk ? worked(10, productNum) : `Between ${MIN} and ${MAX}`}
              </p>
            </div>
          </div>

          <FormStatus error={failure} success={saved} />

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Saving…" : "Save policy"}
          </button>
        </form>
      </Panel>

      {/*
        What the rule does, and what it deliberately does not do. An officer
        changing these numbers should be able to see the edges without having
        to discover them from a student's complaint.
      */}
      <Panel title="How this rule is applied">
        <ul className="space-y-2.5 text-sm leading-relaxed text-muted">
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              The bar is a <strong className="font-medium text-ink">floor, and inclusive</strong>: a
              drive paying exactly the threshold is open. Only drives below it are closed.
            </span>
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              It applies only to a student who has recorded an{" "}
              <strong className="font-medium text-ink">accepted</strong> placement on their own
              profile. Applying somewhere, or being called to an interview, counts for nothing
              here.
            </span>
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              A student is told which company and which figure is gating them, so they can correct
              the record if it is wrong rather than quietly losing drives.
            </span>
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              Nothing is recalculated and stored. Change these numbers and every board is gated by
              the new ones the next time it is opened — including boards already on screen, at
              their next refresh.
            </span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
