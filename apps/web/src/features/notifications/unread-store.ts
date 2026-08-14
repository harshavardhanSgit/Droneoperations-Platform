"use client";

import { useSyncExternalStore } from "react";

import * as api from "./api";

/**
 * ONE unread count, for the whole app.
 *
 * There used to be three, each with its own useState and its own fetch: the
 * sidebar badge, the bell, and the notifications page header. Reading a
 * notification on any one of them updated that copy and left the other two
 * showing the old number until a reload — which is exactly what it looked
 * like: a count that would not update.
 *
 * The bug was not the fetching. It was that "how many are unread" is one fact
 * and three components each believed they owned it. A module-level store makes
 * it one value with three readers, so marking something read anywhere is
 * visible everywhere in the same tick.
 *
 * Same shape as the theme store — useSyncExternalStore over a plain value —
 * because it has the same property: shared state that lives outside React and
 * needs no provider, so no component has to be nested under anything.
 */
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

/**
 * Publish a count the caller already has.
 *
 * Listing notifications returns `unread` alongside the items, so a screen that
 * has just fetched a list should share that number rather than spend a second
 * request asking for it.
 */
export function setUnreadCount(next: number): void {
  if (next === unread) return; // no-op writes must not wake every subscriber
  unread = next;
  emit();
}

/**
 * Ask the server and publish the answer.
 *
 * Used after marking something read, and on focus. Failures are swallowed: a
 * stale count is a far smaller problem than an error surfaced over whatever
 * the user was actually doing.
 */
export async function refreshUnreadCount(): Promise<void> {
  try {
    setUnreadCount(await api.unreadCount());
  } catch {
    // Keep the last known value.
  }
}
