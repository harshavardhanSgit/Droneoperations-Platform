"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Notification } from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import * as notificationApi from "@/features/notifications/api";
import { dayLabel, destinationFor, timeLabel } from "@/features/notifications/route";

/**
 * The bell is a preview — the last fifteen, in a dropdown you lose the moment
 * you click anything. This is the record: everything, grouped by day, filterable
 * down to what still needs an answer.
 */
function Notifications() {
  const { account } = useAuth();

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () =>
    notificationApi.listNotifications(100).then((list) => {
      setItems(list.items);
      setUnread(list.unread);
    });

  useEffect(() => {
    let cancelled = false;

    notificationApi
      .listNotifications(100)
      .then((list) => {
        if (cancelled) return;
        setItems(list.items);
        setUnread(list.unread);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "Could not load your notifications",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const readAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await notificationApi.markAllRead();
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "Could not mark those as read");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Marks read optimistically. This is the one place where not waiting for the
   * server is right: the user is navigating away, and a row that stays bold
   * until a round trip completes looks broken. The worst case is a read flag
   * that reverts on the next load — no data is lost either way.
   */
  const open = (notification: Notification) => {
    if (notification.read) return;

    setItems((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
    );
    setUnread((n) => Math.max(0, n - 1));
    void notificationApi.markRead(notification.id).catch(() => undefined);
  };

  const visible = onlyUnread ? items.filter((n) => !n.read) : items;

  // Grouped in render order, so the API's ordering stays the source of truth.
  const groups: { label: string; items: Notification[] }[] = [];
  for (const item of visible) {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "Everything is read."}
        action={
          unread > 0 ? (
            <Button size="console" disabled={busy} onClick={() => void readAll()}>
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex gap-1">
        {[
          { value: false, label: "All" },
          { value: true, label: "Unread" },
        ].map((f) => (
          <button
            key={f.label}
            onClick={() => setOnlyUnread(f.value)}
            className={`h-8 rounded-control px-3 text-sm ${
              onlyUnread === f.value
                ? "bg-accent font-medium text-accent-fg"
                : "text-fg-muted hover:bg-neutral-bg hover:text-fg"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title={onlyUnread ? "Nothing unread" : "No notifications yet"}
          description={
            onlyUnread
              ? "You are up to date."
              : "When something happens on one of your jobs, it lands here."
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                {group.label}
              </h2>

              <Surface className="divide-y divide-border">
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={destinationFor(item, account)}
                    onClick={() => open(item)}
                    className="flex gap-3 px-4 py-3 transition-colors first:rounded-t-surface last:rounded-b-surface hover:bg-neutral-bg"
                  >
                    {/* A dot, not a bold row: it survives being read without the
                        layout shifting, and it scans down the left edge. */}
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        item.read ? "bg-transparent" : "bg-info"
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${item.read ? "text-fg-muted" : "font-medium"}`}>
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="mt-0.5 text-sm text-fg-muted">{item.body}</p>
                      ) : null}
                    </div>

                    <span className="tabular shrink-0 text-xs text-fg-subtle">
                      {timeLabel(item.createdAt)}
                    </span>
                  </Link>
                ))}
              </Surface>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}
