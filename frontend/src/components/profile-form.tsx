import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { get, send } from "../lib/api";
import { Field, FormStatus, SelectField } from "./field";
import type { BatchPolicy, ProfileDoc } from "../lib/types";

const POLICIES = [
  { value: "none", label: "No restriction — I can sit for everything" },
  { value: "one_offer", label: "One offer only — accepting ends my season" },
  { value: "dream_threshold", label: "Dream threshold — only above a CTC line" },
];

/**
 * The multipliers are the CDC officer's to set, so they are fetched rather
 * than written here.
 *
 * They used to be two constants in this file. That was fine while the numbers
 * were fixed and wrong the moment they stopped being — the student would have
 * been shown "× 1.5" while the server gated them at 1.75, which is the worst
 * kind of disagreement because both sides look confident.
 *
 * The standard numbers are still the fallback, matching the server's, so the
 * preview says something sensible before the request lands.
 */
const FALLBACK: Record<string, number> = { service_based: 1.5, product_based: 2 };

export function ProfileForm({
  initial,
  onSaved,
}: {
  initial: ProfileDoc;
  onSaved?: () => void;
}) {
  const [policy, setPolicy] = useState(initial.policy);
  const [placed, setPlaced] = useState(initial.hasSecuredPlacement);
  const [securedCtc, setSecuredCtc] = useState(String(initial.securedCtcLpa ?? ""));
  const [category, setCategory] = useState<string>(initial.securedCategory ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [multipliers, setMultipliers] = useState<Record<string, number>>(FALLBACK);
  const [policySetByOfficer, setPolicySetByOfficer] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await get<{ policy: BatchPolicy }>("/api/policy");
      if (!data) return;
      setMultipliers({
        service_based: data.policy.serviceMultiplier,
        product_based: data.policy.productMultiplier,
      });
      setPolicySetByOfficer(data.policy.configured);
    })();
  }, []);

  const CATEGORIES = [
    { value: "", label: "Choose one…" },
    {
      value: "service_based",
      label: `Service-based — threshold is ${multipliers.service_based}× the package`,
    },
    {
      value: "product_based",
      label: `Product-based — threshold is ${multipliers.product_based}× the package`,
    },
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setSaved(false);
    setFields({});

    const form = new FormData(event.currentTarget);
    const body = {
      cgpa: form.get("cgpa"),
      activeBacklogs: form.get("activeBacklogs"),
      branch: form.get("branch"),
      tenthPercent: form.get("tenthPercent"),
      twelfthPercent: form.get("twelfthPercent"),
      gapYears: form.get("gapYears"),
      policy: form.get("policy"),
      dreamCtcLpa: form.get("dreamCtcLpa"),
      hasSecuredPlacement: placed,
      securedCompany: form.get("securedCompany"),
      securedCtcLpa: form.get("securedCtcLpa"),
      securedCategory: form.get("securedCategory") || null,
    };

    const { failure } = await send("/api/profile", "PUT", body);
    setBusy(false);

    if (failure) {
      setMessage(failure.message);
      setFields(failure.fields);
      return;
    }
    // Only after the server confirms.
    setSaved(true);
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Branch"
          name="branch"
          defaultValue={initial.branch}
          placeholder="CSE"
          error={fields.branch}
          required
        />
        <Field
          label="CGPA"
          name="cgpa"
          type="number"
          step="0.01"
          min={0}
          max={10}
          defaultValue={initial.cgpa ?? ""}
          error={fields.cgpa}
          hint="On a 10-point scale"
        />
        <Field
          label="Active backlogs"
          name="activeBacklogs"
          type="number"
          min={0}
          defaultValue={initial.activeBacklogs ?? ""}
          error={fields.activeBacklogs}
          hint="Currently uncleared, not historical"
        />
        <Field
          label="Gap years"
          name="gapYears"
          type="number"
          min={0}
          defaultValue={initial.gapYears ?? ""}
          error={fields.gapYears}
        />
        <Field
          label="10th percentage"
          name="tenthPercent"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={initial.tenthPercent ?? ""}
          error={fields.tenthPercent}
        />
        <Field
          label="12th percentage"
          name="twelfthPercent"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={initial.twelfthPercent ?? ""}
          error={fields.twelfthPercent}
        />
      </div>

      <div className="panel-flush p-4">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          A field you leave blank is stored as &ldquo;not provided&rdquo;, not as zero. Drives that
          ask for it will report <span className="text-warn">cannot determine</span> rather than
          quietly passing or failing you.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="College placement policy"
            name="policy"
            value={policy}
            options={POLICIES}
            onChange={(value) => setPolicy(value as ProfileDoc["policy"])}
            error={fields.policy}
          />
          {policy === "dream_threshold" && (
            <Field
              label="Dream CTC (LPA)"
              name="dreamCtcLpa"
              type="number"
              step="0.1"
              min={0}
              defaultValue={initial.dreamCtcLpa ?? ""}
              error={fields.dreamCtcLpa}
              hint="Accepting below this line closes the rest"
              required
            />
          )}
        </div>
      </div>

      {/*
        Being placed is something the student states. It is deliberately not
        inferred from an application reaching "offer received": an offer in
        hand is not an offer accepted, and reading one as the other would close
        their whole board the moment a company called them.
      */}
      <div className="panel-flush p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="hasSecuredPlacement"
            checked={placed}
            onChange={(event) => setPlaced(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-edge accent-accent"
          />
          <span className="min-w-0">
            <span className="text-sm font-medium">I have already accepted a placement</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              Your college lets a placed student sit only for a materially better package. Tick
              this and the board will close anything below that bar, and say why.
            </span>
          </span>
        </label>

        {placed && (
          <div className="mt-4 animate-slide-up space-y-4 border-t border-edge pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Company you accepted"
                name="securedCompany"
                defaultValue={initial.securedCompany ?? ""}
                placeholder="Infosys"
                error={fields.securedCompany}
                required
              />
              <Field
                label="Package secured (LPA)"
                name="securedCtcLpa"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                value={securedCtc}
                onChange={setSecuredCtc}
                error={fields.securedCtcLpa}
                required
              />
            </div>
            <SelectField
              label="Company type"
              name="securedCategory"
              value={category}
              options={CATEGORIES}
              onChange={setCategory}
              error={fields.securedCategory}
              hint="The multiplier depends on this, so it decides which drives stay open"
              required
            />

            {/* The arithmetic, shown as it is typed. The student should never
                have to guess what bar the tool is applying to them. */}
            {category && Number(securedCtc) > 0 && (
              <p
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/5 px-3.5 py-3 text-sm text-info"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="tabular font-medium">
                    {securedCtc} LPA × {multipliers[category]} ={" "}
                    {Math.round(Number(securedCtc) * multipliers[category] * 100) / 100} LPA
                  </span>
                  <span className="mt-0.5 block">
                    Drives paying at least that stay open to you. Anything below it will be shown
                    as blocked, with this calculation as the reason.
                  </span>
                  <span className="mt-1 block text-xs opacity-80">
                    {policySetByOfficer
                      ? "Your placement office set this multiplier."
                      : "This is the standard multiplier; your placement office has not changed it."}
                  </span>
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      <FormStatus
        error={message}
        success={saved ? "Saved. Every verdict has been recalculated." : null}
      />

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
