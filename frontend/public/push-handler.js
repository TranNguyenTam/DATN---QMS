/* Web Push handler — được VitePWA (workbox.importScripts) nhúng vào service worker.
   Nhận push từ server (kể cả khi app đã đóng) và hiện thông báo hệ thống. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "QMS — Theo dõi số thứ tự";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "qms-turn",
    renotify: true,
    data: { url: data.url || "/track" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/track";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ("focus" in w) {
            w.navigate(url);
            return w.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
