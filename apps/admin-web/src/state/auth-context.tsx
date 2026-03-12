import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";
import type { AdminLoginResponse } from "../types/api";

type AuthState = {
  token: string | null;
  role: AdminLoginResponse["role"] | null;
};

type AuthContextValue = AuthState & {
  setAuth: (next: AuthState) => void;
  clearAuth: () => void;
};

const STORAGE_KEY = "license_admin_auth";

const AuthContext = createContext<AuthContextValue | null>(null);

function loadAuth(): AuthState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { token: null, role: null };
  }
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return { token: null, role: null };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [auth, setAuthState] = useState<AuthState>(() => loadAuth());

  const value = useMemo<AuthContextValue>(
    () => ({
      ...auth,
      setAuth(next) {
        setAuthState(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      clearAuth() {
        const next = { token: null, role: null };
        setAuthState(next);
        localStorage.removeItem(STORAGE_KEY);
      },
    }),
    [auth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
