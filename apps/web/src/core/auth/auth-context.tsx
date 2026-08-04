"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
   * True once an explicit sign-in or sign-out has decided who the user is.
   *
   * Session restore is asynchronous and can therefore still be in flight when
   * someone signs in — and a late restore response would overwrite the fresh
   * identity with the previous one, leaving the app rendering one role's
   * navigation while holding another role's access token. Unmount is not the
   * only reason to discard a stale response.
   */
  const decided = useRef(false);

  /**
   * Session restore. The access token lives in memory, so a page reload loses
   * it — but the refresh cookie survives, so we exchange it for a new access
   * token on mount. This is the trade for not putting tokens in localStorage:
   * one extra request per page load instead of an XSS-readable credential.
   */
  useEffect(() => {
    let cancelled = false;
    const stale = () => cancelled || decided.current;

    void (async () => {
      const restored = await refreshSession();

      if (!restored) {
        if (!stale()) setStatus("anonymous");
        return;
      }

      try {
        const me = await authApi.getCurrentAccount();
        if (!stale()) {
          setAccount(me);
          setStatus("authenticated");
        }
      } catch {
        if (!stale()) setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);

    // Claim the identity before any state is written, so a session restore
    // still in flight cannot land afterwards and overwrite it.
    decided.current = true;

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
    decided.current = true;
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
