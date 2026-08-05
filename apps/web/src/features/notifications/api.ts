import { apiFetch } from "@/core/api/client";
import type { NotificationList } from "@/core/api/types";

/** The bell shows a preview; the page asks for the full history. */
export const listNotifications = (take = 15) =>
  apiFetch<NotificationList>(`/api/v1/notifications?take=${take}`);

export const unreadCount = () =>
  apiFetch<{ unread: number }>("/api/v1/notifications/unread-count").then((r) => r.unread);

export const markRead = (id: string) =>
  apiFetch<null>(`/api/v1/notifications/${id}/read`, { method: "POST" });

export const markAllRead = () =>
  apiFetch<null>("/api/v1/notifications/read-all", { method: "POST" });
