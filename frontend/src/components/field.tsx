import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * One labelled input, with its validation message underneath.
 *
 * Errors come back from the API keyed by field name, so a form renders them by
 * passing `error={fields.cgpa}` — there is no second copy of the validation
 * rules in the browser to drift out of step with the server's.
 *
 * The message container is `aria-live` and wired with `aria-describedby`, so a
 * validation failure is announced and associated with its input rather than
 * only appearing next to it.
 */

interface BaseProps {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function Label({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="label" htmlFor={name}>
      {label}
      {required ? (
        <span className="ml-1 text-bad" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="ml-1.5 font-normal text-faint">Optional</span>
      )}
    </label>
  );
}

function Message({ error, hint, name }: { error?: string; hint?: string; name: string }) {
  return (
    <div aria-live="polite" id={`${name}-message`} className="min-h-0">
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-bad">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  type = "text",
  defaultValue,
  value,
  onChange,
  step,
  min,
  max,
  placeholder,
  autoComplete,
  inputMode,
}: BaseProps & {
  type?: string;
  defaultValue?: string | number;
  value?: string | number;
  onChange?: (value: string) => void;
  step?: string;
  min?: string | number;
  max?: string | number;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
}) {
  return (
    <div>
      <Label label={label} name={name} required={required} />
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={onChange ? undefined : defaultValue}
        value={onChange ? value : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={`${name}-message`}
        className={`field ${error ? "border-bad focus:border-bad" : ""}`}
      />
      <Message error={error} hint={hint} name={name} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  defaultValue,
  value,
  options,
  onChange,
}: BaseProps & {
  defaultValue?: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
}) {
  return (
    <div>
      <Label label={label} name={name} required={required} />
      <select
        id={name}
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        required={required}
        onChange={(event) => onChange?.(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${name}-message`}
        className={`field ${error ? "border-bad focus:border-bad" : ""}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Message error={error} hint={hint} name={name} />
    </div>
  );
}

/**
 * A form-level message.
 *
 * `role="status"` with `aria-live="polite"`: the student just submitted and is
 * waiting on the result, but interrupting a screen reader mid-sentence to say
 * "Saved" is worse than letting it finish. Success is only ever rendered by a
 * caller that has already had the server confirm it.
 */
export function FormStatus({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return <div aria-live="polite" role="status" className="sr-only" />;
  return (
    <div aria-live="polite" role="status">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2.5 text-sm text-bad">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {success && (
        <p className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2.5 text-sm text-ok">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{success}</span>
        </p>
      )}
    </div>
  );
}
