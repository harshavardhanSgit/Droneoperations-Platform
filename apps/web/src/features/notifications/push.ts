import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";

import { apiFetch } from "@/core/api/client";

/**
 * Browser push, via Firebase Cloud Messaging.
 *
 * EVERY function here is written to be a no-op when push is unavailable, and
 * unavailable is the normal case rather than an error:
 *
 *   - no Firebase config in the environment (a fresh clone, CI, Docker)
 *   - a browser without the Push API (Safari outside an installed PWA)
 *   - a user who declined, or has not been asked
 *
 * Nothing here throws into the UI. The bell works without any of it — push
 * only decides whether the OS also shows a banner.
 */

/**
 * These are PUBLIC values. Firebase web config identifies a project; it does
 * not authorise anything, which is why Google ships it in client bundles by
 * design. The secret half is the service account, and that lives only on the
 * API. Do not let the word "apiKey" suggest otherwise.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/** Configured at BUILD time — NEXT_PUBLIC_* is inlined, never read at runtime. */
export const pushConfigured = Boolean(
  config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey,
);

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config as Required<typeof config>);
}

async function messaging(): Promise<Messaging | null> {
  // isSupported() is the honest check. Testing for `Notification` alone passes
  // on iOS Safari, which then fails at getToken() — this returns false there
  // unless the site is an installed PWA.
  if (!pushConfigured || !(await isSupported())) return null;

  return getMessaging(app());
}

/**
 * Can we even offer this?
 *
 * Checked before showing any UI, because a browser grants exactly one prompt:
 * decline it and it is gone permanently, with no way for the site to ask
 * again. Offering a button that leads to a prompt we cannot honour spends
 * that once-only chance on nothing.
 */
export async function pushAvailable(): Promise<boolean> {
  if (!(await messaging())) return false;

  try {
    const { enabled } = await apiFetch<{ enabled: boolean }>("/api/v1/notifications/push-status");
    return enabled;
  } catch {
    // Server unreachable or the route missing (an older deploy). Do not offer.
    return false;
  }
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export function permissionState(): PushPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PushPermission;
}

/**
 * Ask for permission and register this browser.
 *
 * MUST be called from a user gesture — a click. Browsers ignore or penalise a
 * permission request made on page load, and asking someone who has not
 * indicated any interest is the behaviour that made these prompts hated.
 *
 * Returns the resulting permission so the caller can explain what happened,
 * rather than a boolean that cannot distinguish "declined" from "broken".
 */
export async function enablePush(): Promise<PushPermission> {
  const client = await messaging();
  if (!client) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushPermission;

  try {
    // The service worker is registered explicitly rather than left to the SDK:
    // Next serves it from /public at the site root, and passing the
    // registration avoids the SDK looking for it at a path that does not exist.
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(client, { vapidKey, serviceWorkerRegistration: registration });

    if (!token) return "default";

    await apiFetch<null>("/api/v1/notifications/devices", {
      method: "POST",
      body: JSON.stringify({ token, platform: "web" }),
    });

    return "granted";
  } catch {
    // A blocked service worker, a network failure, a bad VAPID key. The user
    // has granted permission but nothing will arrive; report it as unsupported
    // rather than claiming success.
    return "unsupported";
  }
}

/**
 * Drop this browser's registration — called on sign-out.
 *
 * Without it, a shared machine keeps delivering one person's notifications
 * after the next person signs in. Failures are ignored: sign-out must never be
 * blocked by a cleanup call.
 */
export async function disablePush(): Promise<void> {
  const client = await messaging();
  if (!client) return;

  try {
    const token = await getToken(client, { vapidKey });
    if (!token) return;

    await apiFetch<null>("/api/v1/notifications/devices", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    });
  } catch {
    // Nothing to do, and nothing worth telling the user about.
  }
}

/**
 * Messages arriving while the tab is in the FOREGROUND.
 *
 * The service worker never fires for these — a browser will not show a banner
 * for a page you are already looking at — so without this handler a
 * notification would arrive silently and the bell would stay stale until the
 * next focus event. This is what makes the count live.
 *
 * Returns an unsubscribe function, or a no-op when push is unavailable.
 */
export async function onForegroundMessage(handler: () => void): Promise<() => void> {
  const client = await messaging();
  if (!client) return () => {};

  return onMessage(client, () => handler());
}
