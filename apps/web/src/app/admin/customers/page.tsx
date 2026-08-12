"use client";

import { useEffect, useState } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, Page, PageHeader } from "@/components/ui/surface";
import { FormError } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import type { OwnOrganisation } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import * as adminApi from "@/features/admin/api";
import { shortDate } from "@/features/bookings/format";

const TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individual",
  BUSINESS: "Business",
  INSTITUTION: "Institution",
};

function Customers() {
  const [items, setItems] = useState<OwnOrganisation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The effect owns its own fetch and every setState happens inside a promise
  // callback, never synchronously in the effect body — the same shape the
  // provider onboarding page uses. `cancelled` stops a slow response writing
  // to an unmounted component, or a superseded page landing after a newer one.
  useEffect(() => {
    let cancelled = false;

    // Customers are Organisations narrowed by kind, not a separate entity —
    // so this is the shared list endpoint, not a bespoke one.
    adminApi
      .listOrganisations("CUSTOMER", page)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load customers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  const pages = Math.max(1, Math.ceil(total / 20));

  // Paging is a user action, so the spinner is raised there rather than in an
  // effect reacting to the page number changing.
  const goTo = (next: number) => {
    setLoading(true);
    setPage(next);
  };

  return (
    <Page size="console">
      <PageHeader
        title="Customers"
        description="Everyone who books work on the platform."
      />

      <FormError message={error} />

      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customer organisations appear here as soon as someone registers."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-surface border border-border">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-subtle">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((org) => (
                  <tr key={org.id}>
                    <td className="px-4 py-3 font-medium">{org.name}</td>
                    <td className="px-4 py-3 text-fg-muted">
                      {TYPE_LABEL[org.type] ?? org.type}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        size="console"
                        tone={org.status === "ACTIVE" ? "success" : "danger"}
                      >
                        {org.status === "ACTIVE" ? "Active" : "Suspended"}
                      </StatusPill>
                    </td>
                    <td className="tabular px-4 py-3 text-fg-muted">
                      {shortDate(org.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-fg-muted">
              <span className="tabular">
                Page {page} of {pages} · {total} customers
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goTo(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="h-8 rounded-control border border-border-strong px-3 disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  onClick={() => goTo(Math.min(pages, page + 1))}
                  disabled={page === pages}
                  className="h-8 rounded-control border border-border-strong px-3 disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

export default function CustomersPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PLATFORM" role="ADMIN">
        <Customers />
      </RequireRole>
    </RequireAuth>
  );
}
