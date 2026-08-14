"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Notification } from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import * as api from "@/features/notifications/api";
import {
  enablePush,
  onForegroundMessage,
  permissionState,
  pushAvailable,
} from "@/features/notifications/push";
import { destinationFor } from "@/features/notifications/route";

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

export function NotificationBell() {
  const { account } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Whether to offer the opt-in row, and what to say after they use it.
  const [canEnablePush, setCanEnablePush] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  const refreshCount = useCallback(() => {
    void api.unreadCount().then(setUnread).catch(() => undefined);
  }, []);

  /**
   * Refetch on mount and whenever the tab regains focus.
   *
   * Deliberately not a short polling interval: the count is cheap but not free,
   * and a user who is not looking at the tab does not need a live number.
   * Real-time delivery is an SSE transport swap behind the same endpoint.
   */
  useEffect(() => {
    refreshCount();
    window.addEventListener("focus", refreshCount);
    return () => window.removeEventListener("focus", refreshCount);
  }, [refreshCount]);

  /**
   * A push arriving while the tab is open updates the count immediately.
   *
   * The service worker deliberately does NOT fire for these — browsers will
   * not show a banner for a page you are already looking at — so without this
   * the notification would land silently and the bell would stay stale until
   * the next focus event.
   *
   * Returns a no-op unsubscribe when push is unavailable, which is the normal
   * case for anyone who has not set up Firebase.
   */
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void onForegroundMessage(refreshCount).then((off) => {
      if (cancelled) off();
      else unsubscribe = off;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refreshCount]);

  /**
   * Whether to offer the "turn on notifications" row at all.
   *
   * Asked once, and only when everything needed is actually in place: the
   * browser supports push, the server has credentials to send it, and the user
   * has neither granted nor refused yet. A browser gives exactly one prompt —
   * decline it and it is gone for good — so offering one we could not honour
   * would spend that single chance on nothing.
   */
  useEffect(() => {
    let cancelled = false;

    void pushAvailable().then((available) => {
      if (!cancelled && available && permissionState() === "default") setCanEnablePush(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOnPush() {
    setCanEnablePush(false);

    const result = await enablePush();
    if (result === "granted") setPushNote("Notifications are on for this browser.");
    else if (result === "denied") setPushNote("Your browser blocked notifications.");
    else setPushNote("This browser cannot show notifications.");
  }

  useEffect(() => {
    if (!open) return;

    function onClickOutside(event: MouseEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);

    if (next) {
      try {
        const list = await api.listNotifications();
        setItems(list.items);
        setUnread(list.unread);
      } catch {
        setItems([]);
      }
    }
  }

  async function readAll() {
    await api.markAllRead().catch(() => undefined);
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={panel}>
      <button
        onClick={() => void toggle()}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative rounded-md px-2 py-1.5 text-sm hover:bg-neutral-bg"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border-strong bg-bg-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 ? (
              <button
                onClick={() => void readAll()}
                className="text-xs text-fg-muted hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {/*
            The opt-in, offered inside the panel rather than as a page-load
            prompt. It appears only when it can actually be honoured, and the
            click is the user gesture browsers require — a request made without
            one is ignored or penalised.
          */}
          {canEnablePush ? (
            <button
              onClick={() => void turnOnPush()}
              className="flex w-full items-start gap-2 border-b border-border bg-info-bg px-4 py-2.5 text-left hover:opacity-90"
            >
              <span aria-hidden className="mt-0.5 text-sm">
                🔔
              </span>
              <span>
                <span className="block text-xs font-medium text-info">
                  Get notified when something needs you
                </span>
                <span className="mt-0.5 block text-[11px] text-fg-muted">
                  Even when this tab is closed. You can turn it off in your browser.
                </span>
              </span>
            </button>
          ) : null}

          {pushNote ? (
            <p className="border-b border-border px-4 py-2 text-[11px] text-fg-subtle">{pushNote}</p>
          ) : null}

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-subtle">
              Nothing yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {items.map((item) => {
                const body = (
                  <>
                    <p className={`text-sm ${item.read ? "text-fg-muted" : "font-medium"}`}>
                      {item.title}
                    </p>
                    {item.body ? (
                      <p className="mt-0.5 text-xs text-fg-subtle">{item.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-fg-subtle">
                      {ago(item.createdAt)}
                    </p>
                  </>
                );

                return (
                  <li key={item.id} className={item.read ? "" : "bg-info-bg"}>
                    {/*
                      Destination depends on who is reading, not on the event.
                      Linking every notification to /bookings/:id sent providers
                      to a customer-only route and the API answered with a 403.
                    */}
                    <Link
                      href={destinationFor(item, account)}
                      onClick={() => {
                        setOpen(false);
                        if (!item.read) void api.markRead(item.id).then(refreshCount);
                      }}
                      className="block px-4 py-3 hover:bg-neutral-bg"
                    >
                      {body}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > 0 ? (
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-xs text-fg-muted hover:bg-neutral-bg hover:text-fg"
            >
              See all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
