"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Notification } from "@/core/api/types";
import * as api from "@/features/notifications/api";

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

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
                  <li key={item.id} className={item.read ? "" : "bg-blue-500/[0.04]"}>
                    {item.bookingId ? (
                      <Link
                        href={`/bookings/${item.bookingId}`}
                        onClick={() => {
                          setOpen(false);
                          if (!item.read) void api.markRead(item.id).then(refreshCount);
                        }}
                        className="block px-4 py-3 hover:bg-neutral-bg"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
