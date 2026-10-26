/**
 * Web Push in the service worker, pulled into the generated sw.js through
 * workbox's `importScripts` (vite.config.ts).
 *
 * The server writes the text in the device's language, so a push reads the
 * same without any request: the payload is `{ title, body, url, tag }`.
 */

self.addEventListener("push", (event) => {
    /** @type {{ title?: string, body?: string, url?: string, tag?: string }} */
    let message = {};
    try {
        message = event.data ? event.data.json() : {};
    } catch {
        message = { body: event.data ? event.data.text() : "" };
    }
    event.waitUntil(
        self.registration.showNotification(message.title || "Planarium", {
            body: message.body || "",
            tag: message.tag,
            icon: "/icon.svg",
            badge: "/icon.svg",
            data: { url: message.url || "/" },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
            if (open) {
                return open.focus().then((client) => client.navigate(url));
            }
            return self.clients.openWindow(url);
        }),
    );
});
