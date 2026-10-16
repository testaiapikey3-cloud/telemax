/* ============================================================
 * TeleMAX Web — sw.js (service worker)
 * Показывает push-уведомления (звук и вибрация — средствами ОС),
 * открывает нужный чат при клике по уведомлению.
 * Работает, даже когда сайт закрыт — push приходит с сервера.
 * ============================================================ */
'use strict';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

/* ---------- входящий push от сервера ---------- */
self.addEventListener('push', e => {
  let d = null;
  try { d = e.data ? e.data.json() : null; } catch (_) { d = null; }
  if (!d) {
    let text = 'Вам новое уведомление';
    try { text = (e.data && e.data.text && e.data.text()) || text; } catch (_) {}
    d = { title: 'TeleMAX', body: text };
  }
  const title = String(d.title || 'TeleMAX').slice(0, 120);
  const opts = {
    body: String(d.body || '').slice(0, 240),
    icon: d.icon || 'icon-192.png',
    badge: d.badge || 'icon-192.png',
    tag: d.tag || 'telemax',
    renotify: !!d.tag,
    requireInteraction: !!d.requireInteraction,
    silent: !!d.silent,
    vibrate: d.vibrate || [200, 100, 200],
    data: d.data || {},
    timestamp: Date.now()
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

/* ---------- клик по уведомлению: открыть чат ---------- */
self.addEventListener('notificationclick', e => {
  const data = e.notification.data || {};
  e.notification.close();

  const q = [];
  if (data.kind) q.push('tm_kind=' + encodeURIComponent(data.kind));
  if (data.chat) q.push('tm_chat=' + encodeURIComponent(data.chat));
  if (data.user) q.push('tm_user=' + encodeURIComponent(data.user));
  const url = './' + (q.length ? '?' + q.join('&') : '');

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { await c.focus(); } catch (_) {}
        try { c.postMessage({ type: 'tm_open', data }); } catch (_) {}
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
