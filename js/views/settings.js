/* ============================================================
 * Saku — Asisten Kuliah AI
 * views/settings.js — profil, notifikasi, AI, tema, data, instal
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui;
  SAKU.views = SAKU.views || {};
  const Settings = { TICK: false };
  const VERSION = '1.0.8';

  function permStatus() {
    if (!('Notification' in window)) {
      return { txt: 'Browser ini tidak mendukung notifikasi sistem', cls: 'bad' };
    }
    const p = Notification.permission;
    if (p === 'granted') return { txt: 'Izin notifikasi: aktif ✅', cls: 'ok' };
    if (p === 'denied') return { txt: 'Izin notifikasi diblokir — aktifkan lewat pengaturan situs di browser', cls: 'bad' };
    return { txt: 'Izin notifikasi: belum diminta', cls: '' };
  }

  /* kartu khusus saat berjalan di aplikasi native Android (bubble maskot) */
  function nativeBubbleSection() {
    const N = window.SakuNative;
    const allowed = N.isOverlayAllowed();
    const on = N.isBubbleEnabled();
    return '<section class="card card-accent"><h2>' + UI.icon('sparkles', 18) + ' Bubble Maskot</h2>' +
      '<p class="hint">Maskot anime melayang di layar, selalu siap di atas aplikasi apa pun. ' +
      '<strong>Tap</strong> untuk chat, <strong>tahan</strong> untuk pengaturan, <strong>seret</strong> untuk memindahkan — dia juga memantul saat ada pengingat!</p>' +
      (allowed
        ? '<p class="hint ok">✅ Izin "tampil di atas aplikasi lain" aktif</p>'
        : '<p class="hint bad">Izin "tampil di atas aplikasi lain" belum aktif</p>' +
          '<button class="btn btn-primary full" id="s-overlay">' + UI.icon('check', 17) + ' Izinkan overlay</button>') +
      UI.switchRow('s-bubble', 'Tampilkan bubble maskot', 'Melayang di tepi layar, bisa digeser-geser', on) +
      nativeVersionHint() +
      '<p class="hint">Kalau bubble dihilangkan lewat notifikasi Android, nyalakan lagi dari sini.</p></section>';
  }

  /* versi aplikasi native — untuk memastikan APK yang terpasang sudah yang terbaru */
  function nativeVersionHint() {
    try {
      if (window.SakuNative && typeof window.SakuNative.appVersion === 'function') {
        const v = String(window.SakuNative.appVersion() || '').trim();
        if (v && v !== '-') return '<p class="hint">Versi aplikasi Android: <strong>v' + v + '</strong></p>';
      }
    } catch (e) { /* bridge versi lama — lewati saja */ }
    return '';
  }

  function installSection() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let inner = '';
    if (standalone) {
      inner = '<p class="hint ok">✅ Saku sudah terpasang di perangkat ini.</p>';
    } else if (SAKU.app.deferredPrompt) {
      inner = '<p class="hint">Pasang Saku biar selalu ada di layar utama & terasa seperti aplikasi asli.</p>' +
        '<button class="btn btn-primary full" id="s-install">' + UI.icon('download', 18) + ' Pasang sekarang</button>';
    } else if (isIOS) {
      inner = '<p class="hint">Di iPhone/iPad: buka halaman ini di <strong>Safari</strong> → tombol <strong>Bagikan</strong> (ikon kotak dengan panah) → <strong>Tambahkan ke Layar Utama</strong>.</p>';
    } else {
      inner = '<p class="hint">Buka menu browser (⋮) lalu pilih <strong>Instal aplikasi</strong> / <strong>Tambahkan ke layar utama</strong>. ' +
        'Kalau opsi belum muncul, pakai aplikasinya sebentar lalu cek lagi.</p>';
    }
    return '<section class="card"><h2>' + UI.icon('phone', 18) + ' Pasang di HP</h2>' + inner + '</section>';
  }

  function storageInfo() {
    try {
      const raw = localStorage.getItem('saku.v1') || '';
      const kb = (new Blob([raw]).size / 1024).toFixed(1);
      return kb + ' KB';
    } catch (e) { return '-'; }
  }

  Settings.render = function (root) {
    const st = SAKU.store;
    const s = st.data.settings;
    const ai = s.ai;
    const perm = permStatus();

    let html = '<header class="page-head row-head"><div><h1>Pengaturan</h1>' +
      '<p class="muted">Atur Saku sesuai gayamu</p></div></header>';

    /* ----- profil ----- */
    html += '<section class="card"><h2>' + UI.icon('user', 18) + ' Profil</h2>' +
      '<label class="field"><span>Nama panggilan</span>' +
      '<input id="s-name" type="text" maxlength="30" placeholder="Nama kamu" value="' + U.esc(st.data.profile.name) + '"></label>' +
      '<p class="hint">Dipakai untuk menyapamu di Beranda dan oleh asisten AI.</p></section>';

    /* ----- notifikasi ----- */
    html += '<section class="card"><h2>' + UI.icon('bell', 18) + ' Notifikasi</h2>' +
      '<p class="hint ' + perm.cls + '">' + U.esc(perm.txt) + '</p>' +
      UI.switchRow('s-notif', 'Aktifkan pengingat', 'Deadline tugas & kelas yang akan mulai',
        s.notifEnabled && ('Notification' in window) && Notification.permission === 'granted') +
      '<div class="row gap mt-sm">' +
        '<label class="field flex-1"><span>Ingatkan tugas</span><select id="s-lead">' +
          [[30, '30 menit sebelum'], [60, '1 jam sebelum'], [180, '3 jam sebelum'], [1440, '1 hari sebelum']].map(function (o) {
            return '<option value="' + o[0] + '"' + (s.notifLeadMin === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
        '<label class="field flex-1"><span>Ingatkan kelas</span><select id="s-clead">' +
          [[5, '5 menit sebelum'], [10, '10 menit sebelum'], [15, '15 menit sebelum'], [30, '30 menit sebelum']].map(function (o) {
            return '<option value="' + o[0] + '"' + (s.classLeadMin === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
      '</div>' +
      UI.switchRow('s-sound', 'Bunyi notifikasi', 'Nada lembut saat pengingat muncul', s.sound) +
      '<button class="btn btn-ghost full mt-sm" id="s-testnotif">' + UI.icon('bell', 17) + ' Kirim notifikasi percobaan</button>' +
      '<p class="hint">Catatan: pengingat bekerja saat aplikasi terbuka (di HP: biarkan terpasang & sesekali dibuka).</p></section>';

    /* ----- AI ----- */
    html += '<section class="card"><h2>' + UI.icon('sparkles', 18) + ' Asisten AI</h2>' +
      UI.segGroup('provider', [
        { value: 'pollinations', label: 'AI Gratis' },
        { value: 'custom', label: 'API Kustom' }
      ], ai.provider);

    if (ai.provider === 'custom') {
      html += '<label class="field mt-sm"><span>Base URL (OpenAI-compatible)</span>' +
        '<input id="s-base" type="url" placeholder="https://api.groq.com/openai/v1" value="' + U.esc(ai.baseUrl) + '"></label>' +
        '<label class="field"><span>API Key</span>' +
        '<input id="s-key" type="password" placeholder="gsk_…" value="' + U.esc(ai.apiKey) + '" autocomplete="off"></label>' +
        '<label class="field"><span>Model</span>' +
        '<input id="s-cmodel" type="text" placeholder="llama-3.3-70b-versatile" value="' + U.esc(ai.customModel) + '"></label>' +
        '<p class="hint">Cocok untuk Groq, OpenRouter, DeepSeek, dll. Key hanya tersimpan di perangkatmu. Provider gratis: groq.com / openrouter.ai.</p>';
    } else {
      html += '<label class="field mt-sm"><span>Model</span>' +
        '<input id="s-model" type="text" placeholder="openai" value="' + U.esc(ai.model) + '"></label>' +
        '<p class="hint">Mode gratis tanpa API key (Pollinations). Kosongkan biar default "openai". Kalau AI kustom diisi, mode gratis jadi cadangan otomatis.</p>';
    }
    html += '<button class="btn btn-ghost full" id="s-testai">' + UI.icon('zap', 17) + ' Tes koneksi AI</button>' +
      '<div id="ai-test-res" class="hint"></div></section>';

    /* ----- tampilan ----- */
    html += '<section class="card"><h2>' + UI.icon('sun', 18) + ' Tampilan</h2>' +
      UI.segGroup('theme', [
        { value: 'system', label: 'Sistem' },
        { value: 'light', label: 'Terang' },
        { value: 'dark', label: 'Gelap' }
      ], s.theme) + '</section>';

    /* ----- pasang di hp / bubble native ----- */
    html += (typeof window.SakuNative !== 'undefined') ? nativeBubbleSection() : installSection();

    /* ----- data ----- */
    html += '<section class="card"><h2>' + UI.icon('download', 18) + ' Data Kamu</h2>' +
      '<p class="hint">Semua data tersimpan lokal di perangkat ini (' + storageInfo() + '). Cadangkan secara berkala.</p>' +
      '<div class="row gap">' +
        '<button class="btn btn-ghost flex-1" id="s-export">' + UI.icon('download', 17) + ' Ekspor</button>' +
        '<button class="btn btn-ghost flex-1" id="s-import">' + UI.icon('upload', 17) + ' Impor</button>' +
      '</div>' +
      '<input type="file" id="s-file" accept="application/json,.json" hidden>' +
      '<button class="btn btn-ghost danger full mt-sm" id="s-wipe">' + UI.icon('trash', 17) + ' Hapus semua data</button>' +
    '</section>';

    html += '<footer class="about">Saku v' + VERSION + ' · Asisten kuliah AI<br>Tugas & jadwal tersimpan offline di perangkatmu.</footer>';

    root.innerHTML = html;

    /* ===== bindings ===== */

    // profil
    root.querySelector('#s-name').addEventListener('change', function (e) {
      st.setName(e.target.value.trim());
      U.toast('Nama disimpan', 'success');
    });

    // notifikasi
    const swNotif = root.querySelector('#s-notif');
    swNotif.addEventListener('change', async function () {
      if (swNotif.checked) {
        if (!('Notification' in window)) {
          U.toast('Browser tidak mendukung notifikasi sistem', 'error');
          swNotif.checked = false;
          return;
        }
        let p = Notification.permission;
        if (p !== 'granted') {
          try { p = await Notification.requestPermission(); } catch (e) { p = 'denied'; }
        }
        if (p !== 'granted') {
          U.toast('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs.', 'error');
          swNotif.checked = false;
          return;
        }
        st.setSetting('notifEnabled', true);
        U.chime();
        U.toast('Pengingat aktif 🔔', 'success');
      } else {
        st.setSetting('notifEnabled', false);
      }
    });
    root.querySelector('#s-lead').addEventListener('change', function (e) {
      st.setSetting('notifLeadMin', parseInt(e.target.value, 10));
    });
    root.querySelector('#s-clead').addEventListener('change', function (e) {
      st.setSetting('classLeadMin', parseInt(e.target.value, 10));
    });
    root.querySelector('#s-sound').addEventListener('change', function (e) {
      st.setSetting('sound', e.target.checked);
      if (e.target.checked) U.chime();
    });
    root.querySelector('#s-testnotif').addEventListener('click', function () {
      SAKU.app.notify('Notifikasi percobaan 🔔', 'Kalau ini muncul, pengingat deadline & kelas akan berfungsi.', 'test-' + Date.now());
    });

    // AI
    UI.bindSeg(root, function (name, value) {
      if (name === 'provider') st.setSetting('ai.provider', value);
      if (name === 'theme') st.setSetting('theme', value);
    });
    const bind = function (id, path, transform) {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('change', function () {
        st.setSetting(path, transform ? transform(el.value) : el.value.trim());
      });
    };
    bind('#s-model', 'ai.model');
    bind('#s-base', 'ai.baseUrl');
    bind('#s-key', 'ai.apiKey');
    bind('#s-cmodel', 'ai.customModel');

    const tbtn = root.querySelector('#s-testai');
    const tres = root.querySelector('#ai-test-res');
    tbtn.addEventListener('click', async function () {
      tbtn.disabled = true;
      tres.className = 'hint';
      tres.textContent = '⏳ Mengetes koneksi…';
      try {
        const r = await SAKU.ai.test();
        tres.className = 'hint ok';
        tres.innerHTML = '✅ Terhubung via ' + U.esc(r.via) + ' (' + r.ms + ' ms)' +
          (r.transport ? ' · jalur: ' + U.esc(r.transport) : '') +
          (r.sample ? ' · jawaban: "' + U.esc(r.sample) + '"' : '') +
          (r.detail && r.detail.length > 1 ? '<br><span class="tag">' + r.detail.map(U.esc).join('<br>') + '</span>' : '');
      } catch (e) {
        tres.className = 'hint bad';
        const lines = (e && e.detail && e.detail.length) ? e.detail : [((e && e.message) || 'tidak diketahui')];
        tres.innerHTML = '❌ Gagal menghubungi AI:<br>' + lines.map(U.esc).join('<br>') +
          '<br>Cek koneksi internet, lalu (opsional) isi <strong>API Kustom</strong> di atas — Groq/OpenRouter/DeepSeek punya kunci gratis.';
      }
      tbtn.disabled = false;
    });

    // pasang
    const instBtn = root.querySelector('#s-install');
    if (instBtn) instBtn.addEventListener('click', function () { SAKU.app.promptInstall(); });

    // bubble native (Android)
    if (typeof window.SakuNative !== 'undefined') {
      const ovBtn = root.querySelector('#s-overlay');
      if (ovBtn) ovBtn.addEventListener('click', function () { window.SakuNative.requestOverlayPermission(); });
      const bubSw = root.querySelector('#s-bubble');
      if (bubSw) bubSw.addEventListener('change', function () {
        window.SakuNative.setBubbleEnabled(bubSw.checked);
        U.haptic();
        setTimeout(function () { SAKU.app.refresh(); }, 400);
      });
      if (!window.__sakuPermBound) {
        window.__sakuPermBound = true;
        window.addEventListener('saku:native-perm-changed', function () { SAKU.app.refresh(); });
      }
    }

    // data
    root.querySelector('#s-export').addEventListener('click', function () {
      const d = new Date();
      const fname = 'saku-backup-' + d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '.json';
      U.download(fname, st.exportJSON());
      U.toast('Cadangan diunduh', 'success');
    });
    root.querySelector('#s-import').addEventListener('click', function () {
      root.querySelector('#s-file').click();
    });
    root.querySelector('#s-file').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = async function () {
        try {
          const obj = JSON.parse(String(rd.result));
          const yes = await UI.confirm({
            title: 'Impor cadangan?',
            text: 'Data saat ini akan DIGANTIKAN oleh isi berkas "' + f.name + '".',
            okLabel: 'Impor', danger: true
          });
          if (!yes) return;
          st.importJSON(obj);
          SAKU.app.applyTheme();
          U.toast('Data berhasil diimpor 🎉', 'success');
        } catch (err) {
          console.error(err);
          U.toast('Berkas tidak valid', 'error');
        }
      };
      rd.readAsText(f);
      e.target.value = '';
    });
    root.querySelector('#s-wipe').addEventListener('click', async function () {
      const yes = await UI.confirm({
        title: 'Hapus SEMUA data?',
        text: 'Tugas, jadwal, chat, dan pengaturan akan dihapus permanen dari perangkat ini. Ekspor dulu kalau perlu!',
        okLabel: 'Hapus semua', danger: true
      });
      if (!yes) return;
      st.wipe();
      localStorage.removeItem('saku.install.dismissed');
      SAKU.app.applyTheme();
      SAKU.app.seedWelcome(true);
      U.toast('Semua data dihapus', 'info');
    });
  };

  SAKU.views.settings = Settings;
})();
