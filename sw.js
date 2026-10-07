/* ============================================================
 * Saku — Asisten Kuliah AI
 * sw.js — service worker: cache app shell agar offline-ready.
 * Permintaan lintas-origin (API AI) selalu dilewatkan ke network.
 * ============================================================ */
'use strict';

const VERSION = 'v1.0.7';
const SHELL = 'saku-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './js/util.js',
  './js/store.js',
  './js/ui.js',
  './js/ai.js',
  './js/actions.js',
  './js/app.js',
  './js/views/home.js',
  './js/views/tasks.js',
  './js/views/schedule.js',
  './js/views/chat.js',
  './js/views/settings.js',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('saku-') === 0 && k !== SHELL) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return; // POST (API AI) → langsung network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // lintas-origin → network

  // navigasi halaman: network-first, fallback ke shell saat offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // aset lain: cache-first, lalu simpan salinannya
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

// klik notifikasi → fokus / buka aplikasi
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (let i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
