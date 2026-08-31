// Scrolic Service Worker - Web Push & Realtime Notifications
const SW_VERSION = 'scrolic-sw-v1.0.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Handle incoming Web Push event from server
self.addEventListener('push', (event) => {
  let data = {
    title: 'Scrolic Trading Alert',
    body: 'Ada aktivitas baru di akun trading Anda.',
    icon: '/logo.svg',
    badge: '/icon-scrolic.svg',
    data: { url: '/' }
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const notificationTitle = data.title || 'Scrolic Alert';
  const notificationOptions = {
    body: data.body || 'Aktivitas trading baru di Scrolic',
    icon: data.icon || '/logo.svg',
    badge: data.badge || '/icon-scrolic.svg',
    tag: data.data?.eventId || data.data?.id || `scrolic-${Date.now()}`,
    renotify: true,
    vibrate: [150, 50, 100],
    data: {
      url: data.data?.url || '/',
      id: data.data?.id,
      type: data.data?.type
    },
    actions: [
      { action: 'open', title: 'Buka Scrolic' },
      { action: 'dismiss', title: 'Tutup' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// 2. Handle notification click & deep linking
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open, focus it and post navigation event
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK_EVENT',
            url: targetUrl,
            data: event.notification.data
          });
          return client.focus();
        }
      }
      // If no open client, open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
