import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from "firebase/messaging";

import { apiFetch } from "@/core/api/client";

/** Browser push, via Firebase Cloud Messaging. */

/** These are PUBLIC values. */
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
  // isSupported() is the honest check.
  if (!pushConfigured || !(await isSupported())) return null;

  return getMessaging(app());
}

/** Can we even offer this? */
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

/** Obtain a token and hand it to the API. */
async function registerToken(): Promise<void> {
  const client = await messaging();
  if (!client) throw new Error("push unsupported");

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(client, { vapidKey, serviceWorkerRegistration: registration });

  if (!token) throw new Error("no token issued");

  await apiFetch<null>("/api/v1/notifications/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform: "web" }),
  });
}

export function permissionState(): PushPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PushPermission;
}

/** Ask for permission and register this browser. */
/** Register this browser when permission was ALREADY granted. */
export async function syncExistingPermission(): Promise<void> {
  if (permissionState() !== "granted") return;
  if (!(await pushAvailable())) return;

  await registerToken().catch(() => {
    // Nothing to tell the user: they have already consented and this is a
    // background repair. A failure means they get no push, which is the state
    // they were in a moment ago anyway.
  });
}

export async function enablePush(): Promise<PushPermission> {
  const client = await messaging();
  if (!client) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushPermission;

  try {
    await registerToken();
    return "granted";
  } catch {
    // A blocked service worker, a network failure, a bad VAPID key.
    return "unsupported";
  }
}

/** Drop this browser's registration — called on sign-out. */
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

/** Messages arriving while the tab is in the FOREGROUND. */
export async function onForegroundMessage(handler: () => void): Promise<() => void> {
  const client = await messaging();
  if (!client) return () => {};

  return onMessage(client, () => handler());
}
