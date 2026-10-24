import { Navigate } from "react-router-dom";
import { CalendarClock, ListChecks, Scale, ShieldQuestion, SlidersHorizontal } from "lucide-react";
import { AuthForm } from "../components/auth-form";
import { LogoMark, Wordmark } from "../components/logo";
import { ThemeToggle } from "../components/theme-toggle";
import { Loading } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { usePageMeta } from "../lib/use-page-meta";

/**
 * The entry experience.
 *
 * Deliberately not a separate public marketing route. Everything RoundReady
 * does operates on a student's own profile and their batch's drives, so there
 * is nothing to show a signed-out visitor that is not either private or
 * invented — and adding a public route to a codebase where every other page is
 * behind `ProtectedRoute` is a good way to leak something by accident. So the
 * value proposition lives here, beside the sign-in, where it is read once by
 * the person who needs it.
 *
 * Every capability listed below is one the product actually implements.
 */

const CAPABILITIES = [
  {
    Icon: ListChecks,
    title: "Explainable eligibility",
    body: "Every cutoff on the notice checked separately, with the ones you miss named. “CGPA 7.42 against a 7.5 cutoff”, not “ineligible”.",
  },
  {
    Icon: CalendarClock,
    title: "Clash detection",
    body: "Two rounds in the same slot, flagged on both drives before the morning of — and back-to-back slots left alone.",
  },
  {
    Icon: Scale,
    title: "Placement policy",
    body: "One-offer and dream-threshold rules modelled, so you see which drives an offer would close before you reply.",
  },
  {
    Icon: SlidersHorizontal,
    title: "Ranked by what matters",
    body: "Compensation, urgency, how far through you are, and a penalty for conflicts — with the arithmetic shown.",
  },
  {
    Icon: ShieldQuestion,
    title: "Undecided, not guessed",
    body: "A cutoff your profile cannot answer returns “cannot determine”. A missing field is never read as a zero.",
  },
];

export function LoginPage() {
  const { user, loading } = useAuth();
  usePageMeta(
    "Sign in",
    "Campus placement season, with the eligibility maths already done. Sign in to see what you are eligible for, what clashes, and what accepting an offer would cost you.",
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Loading label="Checking your session" rows={1} />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <span className="flex items-center gap-2">
          <LogoMark className="h-[1.3rem] w-[1.3rem]" />
          <Wordmark className="text-[0.95rem]" />
        </span>
        <ThemeToggle className="ml-auto" />
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:pt-16"
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-14">
          {/* ---- Value proposition --------------------------------------- */}
          <div className="min-w-0 animate-slide-up">
            <h1 className="text-display text-3xl font-semibold leading-[1.1] sm:text-4xl lg:text-[2.75rem]">
              Your placement season.
              <br />
              <span className="text-muted">Clearer decisions.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              A spreadsheet can tell you what you wrote down. It cannot tell you whether you clear
              the cutoff, which two tests collide on Tuesday, or which eleven companies close the
              moment you accept an offer. RoundReady does that arithmetic, and shows its working.
            </p>

            <dl className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {CAPABILITIES.map(({ Icon, title, body }) => (
                <div key={title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-card">
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-sm font-semibold">{title}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted">{body}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          {/* ---- Sign in --------------------------------------------------- */}
          <div className="lg:sticky lg:top-10 lg:self-start">
            <div className="panel p-5 sm:p-6">
              <AuthForm />
            </div>
            <p className="mt-4 px-1 text-xs leading-relaxed text-faint">
              Drives are shared with everyone in your college and graduating year. Your profile,
              your applications and every verdict computed from them stay yours alone.
            </p>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <p className="border-t border-edge pt-5 text-xs text-faint">
          © {new Date().getFullYear()} RoundReady
          <span className="mx-1.5">·</span>
          Verdicts are computed from what you enter. Always check the official TPO notice.
        </p>
      </footer>
    </div>
  );
}
