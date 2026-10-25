import { useEffect, useState } from "react";
import { ProfileForm } from "../components/profile-form";
import { OfficerProfilePage } from "./officer-profile";
import { ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { usePageMeta } from "../lib/use-page-meta";
import type { ProfileDoc } from "../lib/types";

const EMPTY: ProfileDoc = {
  cgpa: null,
  activeBacklogs: null,
  branch: "",
  tenthPercent: null,
  twelfthPercent: null,
  gapYears: null,
  policy: "none",
  dreamCtcLpa: null,
  hasSecuredPlacement: false,
  securedCompany: null,
  securedCtcLpa: null,
  securedCategory: null,
};

export function ProfilePage() {
  const { user, isOfficer } = useAuth();
  const [initial, setInitial] = useState<ProfileDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageMeta("Profile");

  /**
   * An officer gets an account page instead, and the student profile is never
   * fetched for them — there is nothing on it that applies.
   */
  useEffect(() => {
    if (isOfficer) return;
    let cancelled = false;
    void (async () => {
      const { data, failure } = await get<{ profile: ProfileDoc | null }>("/api/profile");
      if (cancelled) return;
      if (failure) {
        setError(failure.message);
        return;
      }
      // A profile saved before these fields existed comes back without them,
      // so the defaults are merged in rather than left undefined.
      setInitial({ ...EMPTY, ...(data?.profile ?? {}) });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOfficer]);

  if (isOfficer && user) return <OfficerProfilePage user={user} />;

  if (error) return <ErrorNote message={error} />;
  if (!initial) return <Loading label="Loading your profile" rows={2} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Your profile"
        description="These are the numbers every eligibility verdict is computed against. Change one and the whole board is re-evaluated — nothing is cached."
      />

      <Panel>
        <ProfileForm initial={initial} />
      </Panel>

      <p className="text-xs leading-relaxed text-faint">
        Batch <span className="font-mono text-muted">{user?.batchId}</span> — drives you add are
        visible to everyone in your college and graduating year. Your profile, your applications
        and every verdict computed from them are yours alone.
      </p>
    </div>
  );
}
