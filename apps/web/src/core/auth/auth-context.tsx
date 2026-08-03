"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { refreshSession, setAccessToken } from "@/core/api/client";
import type { CurrentAccount } from "@/core/api/types";
import * as authApi from "@/features/auth/api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: Status;
  account: CurrentAccount | null;
  signIn: (email: string, password: string) => Promise<CurrentAccount>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [account, setAccount] = useState<CurrentAccount | null>(null);

  /**
   * Session restore. The access token lives in memory, so a page reload loses
   * it — but the refresh cookie survives, so we exchange it for a new access
   * token on mount. This is the trade for not putting tokens in localStorage:
   * one extra request per page load instead of an XSS-readable credential.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await refreshSession();

      if (!restored) {
        if (!cancelled) setStatus("anonymous");
        return;
      }

      try {
        const me = await authApi.getCurrentAccount();
        if (!cancelled) {
          setAccount(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);

    const signedIn: CurrentAccount = {
      userId: result.userId,
      email: result.email,
      fullName: result.fullName,
      organisation: result.organisation,
      role: result.role,
    };

    setAccessToken(result.accessToken);
    setAccount(signedIn);
    setStatus("authenticated");

    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    setAccessToken(null);
    setAccount(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, account, signIn, signOut }),
    [status, account, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}
