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

export const logout = () =>
  apiFetch<null>("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
