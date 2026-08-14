import { apiFetch } from "@/core/api/client";
import type { NotificationList } from "@/core/api/types";

/**
 * The bell shows a preview; the page asks for the full history.
 *
 * `limit`, not `take`. This called `?take=` for a long time — a parameter the
 * API has never accepted. PaginationQueryDto exposed `skip`/`take` as GETTERS,
 * so sending one threw inside class-transformer and the request came back 500;
 * the bell quietly showed an empty list and the error looked like a server
 * fault rather than a wrong parameter name.
 *
 * Removing those getters turned it into a 400 that names the offending
 * property, which is how this was finally noticed.
 */
export const listNotifications = (limit = 15) =>
  apiFetch<NotificationList>(`/api/v1/notifications?limit=${limit}`);

export const unreadCount = () =>
  apiFetch<{ unread: number }>("/api/v1/notifications/unread-count").then((r) => r.unread);

export const markRead = (id: string) =>
  apiFetch<null>(`/api/v1/notifications/${id}/read`, { method: "POST" });

export const markAllRead = () =>
  apiFetch<null>("/api/v1/notifications/read-all", { method: "POST" });
