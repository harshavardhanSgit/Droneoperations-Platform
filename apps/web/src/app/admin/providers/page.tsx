"use client";

import { useCallback, useEffect, useState } from "react";

import { FormError } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import type { Provider, ProviderDetail, ProviderDocument } from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import * as adminApi from "@/features/admin/api";

const STAGES = [
  "UNDER_REVIEW",
  "REGISTERED",
  "PROFILE_COMPLETE",
  "DOCUMENTS_SUBMITTED",
  "ACTIVATED",
  "REJECTED",
  "SUSPENDED",
];

function waitingFor(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function Detail({
  provider,
  documents,
  onAction,
  busy,
}: {
  provider: ProviderDetail;
  documents: ProviderDocument[];
  onAction: (action: "activate" | "reject", reason?: string) => void;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const reviewable = provider.stage === "UNDER_REVIEW";

  async function openDocument(documentId: string) {
    const { url } = await adminApi.getDocumentLink(provider.id, documentId);
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="border-t border-border-strong bg-neutral-bg px-4 py-5">
      <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {[
          ["Legal name", provider.legalName],
          ["Registration no.", provider.registrationNumber],
          ["Contact", provider.contactPhone],
          ["Address", provider.addressLine],
          ["City", provider.city],
          ["State", provider.state],
          ["PIN", provider.pincode],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="text-fg-subtle">{label}:</dt>
            <dd>{value ?? <span className="text-fg-subtle">—</span>}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Documents
      </h3>
      {documents.length ? (
        <ul className="mb-5 space-y-1.5 text-sm">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3">
              <button
                onClick={() => void openDocument(doc.id)}
                className="underline underline-offset-4"
              >
                {doc.originalFilename}
              </button>
              <span className="text-fg-subtle">
                {doc.kind} · {(doc.sizeBytes / 1024).toFixed(0)} KB · {doc.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-sm text-fg-subtle">No documents uploaded.</p>
      )}

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        History
      </h3>
      <ol className="mb-5 space-y-1 text-sm text-fg-muted">
        {provider.history.map((event, index) => (
          <li key={index}>
            <span className="tabular-nums text-fg-subtle">
              {new Date(event.at).toLocaleString()}
            </span>{" "}
            {event.fromStage ? `${event.fromStage} → ` : ""}
            {event.toStage}
            {event.reason ? ` — ${event.reason}` : ""}
          </li>
        ))}
      </ol>

      {reviewable ? (
        rejecting ? (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this being rejected? The provider will see this."
              className="w-full rounded-md border border-border-strong bg-bg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={busy || reason.trim().length < 5}
                onClick={() => onAction("reject", reason.trim())}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm rejection
              </button>
              <button
                onClick={() => setRejecting(false)}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => onAction("activate")}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Activate
            </button>
            <button
              onClick={() => setRejecting(true)}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm"
            >
              Reject…
            </button>
          </div>
        )
      ) : (
        <p className="text-xs text-fg-subtle">
          Only an application that is UNDER_REVIEW can be decided.
        </p>
      )}
    </div>
  );
}

function Queue() {
  const { account } = useAuth();

  const [stage, setStage] = useState("UNDER_REVIEW");
  const [rows, setRows] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await adminApi.listProviders(stage);
    setRows(list.items);
    setTotal(list.total);
  }, [stage]);

  // Clearing the open row belongs with the stage change that caused it, not in
  // an effect body — and the fetch keeps its setState inside promise callbacks.
  useEffect(() => {
    let cancelled = false;

    adminApi
      .listProviders(stage)
      .then((list) => {
        if (cancelled) return;
        setOpenId(null);
        setDetail(null);
        setRows(list.items);
        setTotal(list.total);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load the queue");
      });

    return () => {
      cancelled = true;
    };
  }, [stage]);

  async function open(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setError(null);
    setOpenId(id);
    setDetail(null);
    try {
      const [d, docs] = await Promise.all([
        adminApi.getProvider(id),
        adminApi.listProviderDocuments(id),
      ]);
      setDetail(d);
      setDocuments(docs);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load this application");
    }
  }

  async function act(action: "activate" | "reject", reason?: string) {
    if (!openId) return;
    setError(null);
    setBusy(true);
    try {
      if (action === "activate") await adminApi.activateProvider(openId);
      else await adminApi.rejectProvider(openId, reason ?? "");
      setOpenId(null);
      setDetail(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The action failed");
    } finally {
      setBusy(false);
    }
  }

  if (account && account.organisation.kind !== "PLATFORM") {
    return (
      <main className="mx-auto w-full max-w-lg px-6 py-20 text-sm text-fg-muted">
        This console is for platform staff only.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Provider pipeline</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Oldest-waiting first. {total} in {stage.toLowerCase().replace(/_/g, " ")}.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              s === stage
                ? "bg-accent text-accent-fg"
                : "bg-neutral-bg text-fg-muted"
            }`}
          >
            {s.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      <FormError message={error} />

      <div className="mt-4 divide-y divide-border rounded-lg border border-border-strong">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-subtle">
            Nothing in this stage.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id}>
              <button
                onClick={() => void open(row.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-bg"
              >
                <span>
                  <span className="block text-sm font-medium">{row.organisationName}</span>
                  <span className="block text-xs text-fg-subtle">
                    {row.legalName ?? "no business details yet"}
                    {row.city ? ` · ${row.city}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-fg-subtle">
                    waiting {waitingFor(row.stageEnteredAt)}
                  </span>
                  <span className="text-fg-subtle">
                    {openId === row.id ? "▲" : "▼"}
                  </span>
                </span>
              </button>

              {openId === row.id && detail ? (
                <Detail provider={detail} documents={documents} onAction={act} busy={busy} />
              ) : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

export default function AdminProvidersPage() {
  return (
    <RequireAuth>
      <Queue />
    </RequireAuth>
  );
}
