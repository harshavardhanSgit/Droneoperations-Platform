/* eslint-disable no-undef */
/**
 * The service worker that shows a notification when the tab is CLOSED.
 *
 * WHY THIS FILE IS SO ODD, AND WHY IT CANNOT BE TIDIED:
 *
 * 1. It must be served from the site ROOT (/firebase-messaging-sw.js), because
 *    a service worker can only control pages at or below its own path. That is
 *    why it lives in public/ and not in src/.
 *
 * 2. It cannot import from the app. A service worker is a separate script with
 *    no bundler, no modules from src/, and no process.env — so the Firebase
 *    config is repeated here as literals rather than shared.
 *
 * 3. The values below are PUBLIC. Firebase web config identifies a project; it
 *    grants nothing. The secret is the service account, and that exists only on
 *    the API. `apiKey` is a misleading name for a project identifier.
 *
 * 4. It uses the compat SDK via importScripts because the modular SDK is not
 *    loadable in a classic service worker.
 *
 * If the placeholders below are still in place, this file does nothing: it
 * registers, fails to initialise, and no notification is ever shown. That is
 * the intended state for anyone who has not set up Firebase.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Replace these with the values from your Firebase project — the same ones in
// apps/web/.env.local. They must be literals; there is no build step here.
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

if (firebaseConfig.projectId !== "REPLACE_ME") {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  /**
   * Background messages only — the foreground path is handled in the app, by
   * onForegroundMessage, because browsers will not show a banner for a page
   * the user is already looking at.
   */
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? "Drone Operations";

    self.registration.showNotification(title, {
      body: payload.notification?.body ?? "",
      icon: "/icon.png",
      // Collapses repeats: a second notification about the same booking
      // replaces the first rather than stacking another banner.
      tag: payload.data?.bookingId ?? "drone-ops",
      data: { url: payload.data?.url ?? "/notifications" },
    });
  });

  /**
   * Clicking a notification should land on the thing it is about — and reuse
   * an open tab rather than opening a fourth copy of the app.
   */
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const target = event.notification.data?.url ?? "/notifications";

    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }

        return self.clients.openWindow(target);
      }),
    );
  });
}
