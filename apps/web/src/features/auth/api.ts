import { apiFetch } from "@/core/api/client";
import type { CurrentAccount, LoginResponse, RegisterResponse } from "@/core/api/types";

export type AccountType = "CUSTOMER" | "PROVIDER";

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  accountType: AccountType;
  organisationName?: string;
}

export const login = (email: string, password: string) =>
  apiFetch<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const register = (input: RegisterInput) =>
  apiFetch<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getCurrentAccount = () => apiFetch<CurrentAccount>("/api/v1/auth/me");

/** Edit your own name and phone. */
export const updateAccount = (input: { fullName?: string; phone?: string }) =>
  apiFetch<CurrentAccount>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });

/**
 * Returns 204 and revokes EVERY session for this user, including this one — the caller must
 * send the user back to /login rather than pretend they are still signed in.
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<null>("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

export const logout = () =>
  apiFetch<null>("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
