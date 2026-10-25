import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Loading } from "./ui";

/**
 * Everything behind the login.
 *
 * The session check is a request, so there is a moment where the answer is
 * genuinely unknown — rendering the login page during it would bounce a
 * signed-in student to /login on every hard refresh. So "loading" is a third
 * state, not a synonym for "signed out".
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Loading label="Checking your session" rows={2} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * The officer-only pages.
 *
 * Nested inside `ProtectedRoute`, so the session has already resolved by the
 * time this runs and `user` is never null here.
 *
 * This hides a page; it does not protect one. Every route these pages call is
 * gated on the server, and that is what makes a student's write fail — this
 * only stops them reaching a form that was always going to 403, which is a
 * worse way to find out.
 */
export function OfficerRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Loading label="Checking your session" rows={2} />
      </div>
    );
  }

  // Back to the board rather than to a "forbidden" page: a student who typed
  // the URL wants the drive list, and that is one click from here anyway.
  if (user?.role !== "cdc_officer") return <Navigate to="/drives" replace />;

  return <Outlet />;
}

/**
 * The pages that belong to a student's own placement season.
 *
 * The mirror of `OfficerRoute`. A CDC officer has no skill gaps to close, no
 * study plan and no offer to simulate, so these are not merely hidden from
 * their sidebar — typing the URL lands them back on the drives they manage
 * rather than on a revision timetable addressed to them.
 *
 * This is navigation, not authorisation. The data behind these pages is
 * scoped by `userId` on the server, so an officer reaching them would see
 * their own empty planner rather than anyone else's; the guard exists so the
 * product makes sense, not to keep a secret.
 */
export function StudentRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Loading label="Checking your session" rows={2} />
      </div>
    );
  }

  if (user?.role === "cdc_officer") return <Navigate to="/drives" replace />;

  return <Outlet />;
}
