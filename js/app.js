/* ============================================================
 * Saku — Asisten Kuliah AI
 * app.js — bootstrap: tema, router hash, navigasi, pengingat,
 * notifikasi, pemasangan PWA, service worker
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui, st = SAKU.store;
  const App = {};
  SAKU.app = App;

  App.deferredPrompt = null;
  App.pendingDraft = null;
  App.pendingAuto = false;

  const ROUTES = { beranda: 'home', asisten: 'chat', tugas: 'tasks', jadwal: 'schedule', pengaturan: 'settings' };
  const TITLES = { beranda: 'Beranda', asisten: 'Asisten', tugas: 'Tugas', jadwal: 'Jadwal', pengaturan: 'Pengaturan' };
  const NAV = [
    { id: 'beranda',     label: 'Beranda', icon: 'home' },
    { id: 'tugas',       label: 'Tugas',   icon: 'list' },
    { id: 'asisten',     label: 'Asisten', icon: 'sparkles' },
    { id: 'jadwal',      label: 'Jadwal',  icon: 'calendar' },
    { id: 'pengaturan',  label: 'Atur',    icon: 'sliders' }
  ];
  // scope store yg relevan per tampilan
  const VIEW_SCOPES = {
    home: ['tasks', 'classes', 'settings', 'all'],
    tasks: ['tasks', 'settings', 'all'],
    schedule: ['classes', 'settings', 'all'],
    chat: ['chat', 'tasks', 'classes', 'settings', 'all'],
    settings: ['settings', 'all']
  };

  let current = 'beranda';

  /* ================= TEMA ================= */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  App.applyTheme = function () {
    const t = st.data.settings.theme;
    const dark = t === 'dark' || (t === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#f6f7f9');
  };
  try { mq.addEventListener('change', function () { if (st.data.settings.theme === 'system') App.applyTheme(); }); } catch (e) { /* lama */ }

  /* ================= ROUTER ================= */
  function routeFromHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    return ROUTES[h] ? h : 'beranda';
  }

  App.navigate = function (name) {
    if (!ROUTES[name]) return;
    if (name === current) location.hash = '#/' + name; // konsisten
    location.hash = '#/' + name;
  };

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = NAV.map(function (item) {
      return '<button class="nav-i' + (item.id === current ? ' active' : '') + '" data-nav="' + item.id + '" aria-label="' + item.label + '">' +
        UI.icon(item.icon, 22) + '<span>' + item.label + '</span></button>';
    }).join('');
    nav.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        U.haptic();
        App.navigate(b.getAttribute('data-nav'));
      });
    });
    document.title = 'Saku · ' + TITLES[current];
  }

  App.render = function () {
    current = routeFromHash();
    renderNav();
    const root = document.getElementById('view');
    root.className = 'view view-' + current;
    root.scrollTop = 0;
    SAKU.views[ROUTES[current]].render(root);
  };

  App.refresh = function () {
    const view = SAKU.views[ROUTES[current]];
    const root = document.getElementById('view');
    let y = 0;
    const keep = view.PRESERVE !== false;
    if (keep) y = root.scrollTop;
    view.render(root);
    if (keep && y) root.scrollTop = y;
  };

  st.onChange(function (scope) {
    if (scope === 'settings' || scope === 'all') App.applyTheme();
    const scopes = VIEW_SCOPES[ROUTES[current]] || ['all'];
    if (scopes.indexOf(scope) < 0) return;
    App.refresh(); // sheet modal hidup di luar #view, jadi aman saat re-render
  });

  /* ================= PESAN SAMBUTAN ================= */
  App.seedWelcome = function () {
    if (st.data.chat.length) return;
    const name = st.name;
    st.chatAppend('assistant',
      'Halo' + (name ? ' ' + name : '') + '! 👋 Aku **Saku**, asisten kuliahmu. Aku bisa:\n' +
      '- Menjawab pertanyaan & menjelaskan materi kuliah\n' +
      '- Membuat rencana belajar & memberi tips\n' +
      '- Mencatat tugas: *"Tambahkan tugas laporan praktikum deadline Jumat jam 5 sore"*\n' +
      '- Mencatat jadwal: *"Tambahkan jadwal Kalkulus tiap Senin 08.00-09.40 di R.302"*\n' +
      '- Menjawab: *"Tugas apa yang paling dekat deadline?"*\n\n' +
      'Ketik apa saja di bawah ya!');
  };

  /* ================= NOTIFIKASI ================= */
  App.notify = async function (title, body, tag) {
    const s = st.data.settings;
    U.toast(title + (body ? ' — ' + body : ''), 'info', { duration: 5200 });
    if (s.sound) U.chime();
    U.haptic();
    if (!s.notifEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: body, tag: tag || ('saku-' + Date.now()), icon: './icons/icon-192.png', badge: './icons/icon-192.png' };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, opts);
          return;
        }
      }
      new Notification(title, opts); // eslint-disable-line no-new
    } catch (e) {
      try { new Notification(title, opts); } catch (e2) { /* menyerah */ }
    }
  };

  function updateBadge() {
    try {
      if (!('setAppBadge' in navigator)) return;
      const limit = Date.now() + 48 * 3600000;
      const n = st.activeTasks().filter(function (t) {
        const d = U.parseISO(t.deadline);
        return d && d.getTime() <= limit;
      }).length;
      if (n > 0) navigator.setAppBadge(n);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e) { /* abaikan */ }
  }

  /* ================= PENGINGAT (deadline & kelas) ================= */
  const Remind = {
    check: function () {
      const s = st.data.settings;
      const now = new Date();
      let changed = false;

      st.data.tasks.forEach(function (t) {
        if (t.done) return;
        const d = U.parseISO(t.deadline);
        if (!d) return;
        if (!t.notifiedLead && now >= U.addMinutes(d, -s.notifLeadMin) && now < d) {
          t.notifiedLead = true; changed = true;
          App.notify('⏳ Deadline mendekat', '"' + t.title + '" ' + U.relTime(d) + (t.course ? ' · ' + t.course : ''), 'task-lead-' + t.id);
        }
        if (!t.notifiedDue && now >= d) {
          t.notifiedDue = true; changed = true;
          App.notify('🚨 Deadline tiba', '"' + t.title + '" sudah mencapai deadline', 'task-due-' + t.id);
        }
      });

      st.todayClasses().forEach(function (c) {
        if (st.classNotified(c.id)) return;
        if (now >= U.addMinutes(c._start, -s.classLeadMin) && now <= c._end) {
          st.markClassNotified(c.id);
          App.notify('📚 Kelas segera mulai', c.course + ' · pukul ' + c.start.replace(':', '.') + (c.room ? ' di ' + c.room : ''), 'class-' + c.id);
        }
      });

      if (changed) st.save();
      updateBadge();
    }
  };

  function tick() {
    Remind.check();
    const v = SAKU.views[ROUTES[current]];
    if (v && v.TICK && !document.hidden) App.refresh();
  }

  /* ================= PEMASANGAN PWA ================= */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    App.deferredPrompt = e;
    if (current === 'beranda' || current === 'pengaturan') App.refresh();
  });
  window.addEventListener('appinstalled', function () {
    App.deferredPrompt = null;
    U.toast('Saku terpasang! Buka dari layar utama 🎉', 'success');
  });
  App.promptInstall = async function () {
    const e = App.deferredPrompt;
    if (!e) {
      U.toast('Lihat caranya di Pengaturan → Pasang di HP', 'info');
      return;
    }
    e.prompt();
    try {
      const r = await e.userChoice;
      if (r && r.outcome === 'accepted') U.toast('Saku berhasil dipasang 🎉', 'success');
    } catch (err) { /* abaikan */ }
    App.deferredPrompt = null;
    App.refresh();
  };

  /* ================= CHAT SHORTCUT DARI BERANDA ================= */
  App.askViaChat = function (text) {
    App.pendingDraft = text;
    App.pendingAuto = true;
    if (current === 'asisten') App.refresh();
    else location.hash = '#/asisten';
  };

  /* ================= OFFLINE ================= */
  function syncOnline() {
    const off = !navigator.onLine;
    document.getElementById('offline').hidden = !off;
    document.body.classList.toggle('is-offline', off);
  }
  window.addEventListener('online', function () { syncOnline(); U.toast('Kembali online ✅', 'success'); if (current === 'asisten') App.refresh(); });
  window.addEventListener('offline', function () { syncOnline(); U.toast('Koneksi terputus', 'error'); if (current === 'asisten') App.refresh(); });

  /* ================= SERVICE WORKER ================= */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              U.toast('Versi baru Saku tersedia', 'info', {
                duration: 8000, actionLabel: 'Muat ulang',
                onAction: function () { location.reload(); }
              });
            }
          });
        });
      }).catch(function (e) { console.warn('[Saku] SW gagal', e); });
    });
  }

  /* ================= BOOT ================= */
  function init() {
    App.applyTheme();
    if (!location.hash) {
      try { history.replaceState(null, '', '#/beranda'); } catch (e) { location.hash = '#/beranda'; }
    }
    window.addEventListener('hashchange', App.render);
    App.render();
    App.seedWelcome();
    syncOnline();

    // buka kunci audio di sentuhan pertama (kebijakan browser)
    document.addEventListener('pointerdown', function unlock() {
      U.unlockAudio();
      document.removeEventListener('pointerdown', unlock);
    });

    setTimeout(Remind.check, 1500);
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) Remind.check();
    });
    window.addEventListener('beforeunload', function () { st.flush(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
