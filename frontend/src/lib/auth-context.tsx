import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { get } from "./api";
import type { SessionUser } from "./types";

/**
 * Who is signed in.
 *
 * Asked once on load via `/api/auth/me` rather than inferred from a cookie the
 * page cannot read — the session is httpOnly on purpose, so the server is the
 * only thing that can answer this.
 */

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
  /** Convenience for the many places that render one control differently. */
  isOfficer: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await get<{ user: SessionUser | null }>("/api/auth/me");
    setUser(data?.user ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh, setUser, isOfficer: user?.role === "cdc_officer" }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
