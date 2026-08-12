"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { StaffMember } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as adminApi from "@/features/admin/api";
import { shortDate } from "@/features/bookings/format";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Platform admin",
  SERVICE_ENGINEER: "Service engineer",
};

function Users() {
  const toast = useToast();

  const [items, setItems] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SERVICE_ENGINEER">("SERVICE_ENGINEER");

  /** Re-read after a create. Called from an event handler, never from an effect. */
  const load = useCallback(async () => {
    try {
      setItems((await adminApi.listStaff()).items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load staff");
    }
  }, []);

  // Initial load owns its own fetch so every setState lands in a promise
  // callback rather than synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;

    adminApi
      .listStaff()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load staff");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      await adminApi.createStaff({ email: email.trim(), fullName: fullName.trim(), password, role });
      await load();
      setAdding(false);
      setEmail("");
      setFullName("");
      setPassword("");
      toast(`${ROLE_LABEL[role]} added`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors((caught.details?.fields as Record<string, string[]>) ?? {});
      } else {
        setError("Could not create that account");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page size="console">
      <PageHeader
        title="Users"
        description="Platform accounts. Admins and engineers are created here — never by self-registration."
        action={
          <Button size="console" variant={adding ? "ghost" : "primary"} onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Add a user"}
          </Button>
        }
      />

      <FormError message={error} />

      {adding ? (
        <Surface className="mb-4 p-5">
          <h2 className="mb-4 text-sm font-medium">New platform account</h2>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                error={fieldErrors.fullName?.[0]}
              />
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                error={fieldErrors.email?.[0]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Temporary password"
                type="password"
                hint="At least 10 characters. They can change it from their account page."
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                error={fieldErrors.password?.[0]}
              />
              <SelectField
                label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "SERVICE_ENGINEER")}
              >
                <option value="SERVICE_ENGINEER">Service engineer</option>
                <option value="ADMIN">Platform admin</option>
              </SelectField>
            </div>
            <Button type="submit" variant="primary" full disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Surface>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No platform accounts"
          description="Add an admin or a service engineer to get started."
          action={<Button onClick={() => setAdding(true)}>Add a user</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-surface border border-border">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium">{member.fullName}</td>
                  <td className="px-4 py-3 text-fg-muted">{member.email}</td>
                  <td className="px-4 py-3">
                    {/*
                      Colour here is a STATUS distinction: an admin can change
                      the platform, an engineer cannot. Using `info` for the
                      elevated one and neutral for the other keeps that visible
                      without inventing a palette.
                    */}
                    <StatusPill
                      size="console"
                      tone={member.role === "ADMIN" ? "info" : "neutral"}
                    >
                      {ROLE_LABEL[member.role ?? ""] ?? member.role ?? "Unknown"}
                    </StatusPill>
                  </td>
                  <td className="tabular px-4 py-3 text-fg-muted">
                    {member.createdAt ? shortDate(member.createdAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

export default function UsersPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="ADMIN">
        <Users />
      </RequireRole>
    </RequireAuth>
  );
}
