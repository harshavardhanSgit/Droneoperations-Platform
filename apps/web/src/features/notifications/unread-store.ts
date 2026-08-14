"use client";

import { useSyncExternalStore } from "react";

import * as api from "./api";

/** ONE unread count, for the whole app. */
let unread = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Must return a primitive, or React re-renders forever comparing objects. */
const getSnapshot = (): number => unread;

/** The server has not rendered a count; zero is the honest placeholder. */
const getServerSnapshot = (): number => 0;

/** Read the count. Every consumer re-renders when it changes. */
export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Publish a count the caller already has. */
export function setUnreadCount(next: number): void {
  if (next === unread) return; // no-op writes must not wake every subscriber
  unread = next;
  emit();
}

/** Ask the server and publish the answer. */
export async function refreshUnreadCount(): Promise<void> {
  try {
    setUnreadCount(await api.unreadCount());
  } catch {
    // Keep the last known value.
  }
}
