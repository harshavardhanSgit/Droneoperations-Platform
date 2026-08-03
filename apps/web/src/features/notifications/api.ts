import { apiFetch } from "@/core/api/client";
import type { NotificationList } from "@/core/api/types";

export const listNotifications = () =>
  apiFetch<NotificationList>("/api/v1/notifications?limit=15");

export const unreadCount = () =>
  apiFetch<{ unread: number }>("/api/v1/notifications/unread-count").then((r) => r.unread);

export const markRead = (id: string) =>
  apiFetch<null>(`/api/v1/notifications/${id}/read`, { method: "POST" });

export const markAllRead = () =>
  apiFetch<null>("/api/v1/notifications/read-all", { method: "POST" });
