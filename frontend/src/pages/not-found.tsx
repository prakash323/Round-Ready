import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { usePageMeta } from "../lib/use-page-meta";

/**
 * The route back depends on who is asking: a signed-in student goes to their
 * board, a signed-out visitor to sign-in. Sending the latter to "/" would just
 * bounce them through ProtectedRoute to the same place with an extra redirect.
 */
export function NotFoundPage() {
  const { user } = useAuth();
  usePageMeta("Page not found");

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center sm:py-24">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-edge bg-card">
        <Compass className="h-5 w-5 text-faint" aria-hidden="true" />
      </span>
      <h1 className="text-display mt-5 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        That page does not exist. If you followed a link to a drive, it may have been removed by
        someone else in your batch, or it may belong to a different college.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {user ? (
          <>
            <Link to="/" className="btn-primary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to your board
            </Link>
            <Link to="/drives" className="btn-ghost">
              All drives
            </Link>
          </>
        ) : (
          <Link to="/login" className="btn-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
