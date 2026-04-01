const CACHE = "ft-v1";
const ASSETS = ["/", "/index.html", "/style.css", "/app.ts"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});

// Push notification handler
self.addEventListener("push", e => {
  const data = e.data?.json() || { title: "Finance Tracker", body: "You have a reminder!" };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "finance-reminder"
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/"));
});
