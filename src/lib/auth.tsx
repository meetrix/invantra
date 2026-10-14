import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { can, type Permission } from "../../shared/permissions";
import type { User } from "../../shared/types";
import { getMe, logout as apiLogout, SESSION_EVENT } from "./api";

interface AuthState {
  /** undefined while the first check is in flight, null when signed out. */
  user: User | null | undefined;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setUser(await getMe());
    } catch {
      // The server could not be reached. Someone already signed in stays where they are;
      // on first load there is nothing to show but the sign-in page.
      setUser((current) => (current === undefined ? null : current));
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(SESSION_EVENT, refresh);
    return () => window.removeEventListener(SESSION_EVENT, refresh);
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setUser(null);
  }, []);

  const value: AuthState = {
    user,
    setUser,
    logout,
    can: (permission) => can(user?.role, permission),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
