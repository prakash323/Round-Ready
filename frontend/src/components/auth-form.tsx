import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { send } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Field, FormStatus } from "./field";
import type { SessionUser } from "../lib/types";

type Mode = "login" | "register";

/**
 * The same window the server accepts, so the browser's own number validation
 * agrees with the 422 rather than contradicting it.
 */
const gradYearBounds = {
  min: new Date().getFullYear() - 6,
  max: new Date().getFullYear() + 8,
};

export function AuthForm() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A second submit while the first is in flight would create a duplicate
    // account or a second session.
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            college: form.get("college"),
            gradYear: form.get("gradYear"),
            officerCode: form.get("officerCode"),
          };

    const { failure } = await send<{ user: SessionUser }>(`/api/auth/${mode}`, "POST", body);
    setBusy(false);

    if (failure) {
      setMessage(failure.message);
      setFields(failure.fields);
      return;
    }
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Welcome back."
            : "Your college and graduating year decide which drive list you join."}
        </p>
      </div>

      {/* Segmented control, iOS-style. A radiogroup so arrow keys work. */}
      <div
        role="radiogroup"
        aria-label="Sign in or create an account"
        className="flex gap-0.5 rounded-lg border border-edge bg-canvas p-0.5"
      >
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              setMessage(null);
              setFields({});
            }}
            className={`flex-1 rounded-[0.4rem] px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
              mode === m ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <>
          <Field
            label="Full name"
            name="name"
            autoComplete="name"
            error={fields.name}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="College"
              name="college"
              autoComplete="organization"
              error={fields.college}
              hint="Spell it the way your batch-mates do"
              required
            />
            <Field
              label="Graduating year"
              name="gradYear"
              type="number"
              inputMode="numeric"
              min={gradYearBounds.min}
              max={gradYearBounds.max}
              defaultValue={String(new Date().getFullYear() + 2)}
              error={fields.gradYear}
              required
            />
          </div>

          {/*
            Optional, and blank for every student. Shown rather than hidden
            behind a secret URL because a CDC officer registering for the first
            time has no way to discover a hidden one — and leaving it blank is
            already the student path, so nothing is lost by it being visible.
          */}
          <Field
            label="CDC officer code"
            name="officerCode"
            type="password"
            autoComplete="off"
            error={fields.officerCode}
            hint="Leave blank if you are a student. Only the placement office has this."
          />
        </>
      )}

      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={fields.email}
        required
      />

      <div className="relative">
        <Field
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          error={fields.password}
          hint={mode === "register" ? "At least 8 characters" : undefined}
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute right-2 top-[1.85rem] flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:text-ink"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <FormStatus error={message} />

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
