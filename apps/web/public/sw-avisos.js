/* Avisos do Faz quantas? no service worker (importado pelo SW gerado pelo Workbox). */
/* global self */

// Tocar na notificação traz o jogo para a frente (ou abre, se estava fechado).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Push do servidor (a vez chegou com o jogo fechado): vira notificação.
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Faz quantas?', {
      body: data.body || 'Tua vez!',
      tag: data.tag || 'vez',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      data: { url: data.url || '/' },
    }),
  );
});
