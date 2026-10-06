/* ============================================================
 * Saku — Asisten Kuliah AI
 * views/home.js — Beranda: sapaan, kelas hari ini, deadline, CTA chat
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui;
  SAKU.views = SAKU.views || {};
  const Home = { TICK: true };

  function relBadge(d) {
    const now = new Date();
    if (d < now) return '<span class="badge badge-bad">' + U.esc(U.relTime(d)) + '</span>';
    if (d - now < 86400000) return '<span class="badge badge-warn">' + U.esc(U.relTime(d)) + '</span>';
    return '<span class="badge">' + U.esc(U.relTime(d)) + '</span>';
  }

  function installBanner() {
    const dismissed = localStorage.getItem('saku.install.dismissed') === '1';
    if (dismissed) return '';
    const canPrompt = !!(SAKU.app && SAKU.app.deferredPrompt);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone || (!canPrompt && !isIOS)) return '';
    return '<div class="card install-card" id="install-card">' +
      '<div class="install-ic">' + UI.icon('cap', 22) + '</div>' +
      '<div class="install-txt"><strong>Pasang Saku di HP-mu</strong>' +
      '<span>Biar selalu ada di layar utama, siap dipakai kapan pun.</span></div>' +
      '<button class="btn btn-primary btn-sm" id="btn-install">Pasang</button>' +
      '<button class="icon-btn" id="btn-install-x" aria-label="Tutup">' + UI.icon('x', 18) + '</button>' +
      '</div>';
  }

  Home.render = function (root) {
    const st = SAKU.store;
    const name = st.name;
    const now = new Date();
    const active = st.activeTasks();
    const today = st.todayClasses();
    const weekAgo = Date.now() - 7 * 86400000;
    const doneWeek = st.doneTasks().filter(function (t) { return (t.doneAt || 0) > weekAgo; }).length;
    const ongoing = today.filter(function (c) { return c._status === 'ongoing'; }).length;

    let html = '';

    /* ----- header ----- */
    html += '<header class="page-head">' +
      '<div class="brand-row">' +
        '<span class="brand-ic">' + UI.icon('cap', 20) + '</span><span class="brand-name">Saku</span>' +
      '</div>' +
      '<h1>' + U.greeting() + (name ? ', ' + U.esc(name) : '') + ' 👋</h1>' +
      '<p class="muted">' + U.fmtDayDate(now) + '</p>' +
    '</header>';

    /* ----- banner instal ----- */
    html += installBanner();

    /* ----- statistik ----- */
    html += '<div class="stat-row">' +
      '<button class="stat" data-go="tugas"><span class="stat-num">' + active.length + '</span><span class="stat-lbl">Tugas aktif</span></button>' +
      '<button class="stat" data-go="jadwal"><span class="stat-num">' + today.length + '</span><span class="stat-lbl">Kelas hari ini' + (ongoing ? ' • ' + ongoing + ' berlangsung' : '') + '</span></button>' +
      '<button class="stat" data-go="tugas"><span class="stat-num">' + doneWeek + '</span><span class="stat-lbl">Selesai 7 hari</span></button>' +
    '</div>';

    /* ----- kelas hari ini ----- */
    html += '<section class="card"><div class="card-head">' +
      '<h2>' + UI.icon('calendar', 18) + ' Kelas hari ini</h2>' +
      '<button class="text-btn" data-go="jadwal">Lihat semua</button></div>';
    if (!today.length) {
      html += '<p class="empty-line">Tidak ada kelas hari ini 🎉 <button class="text-btn" data-go="jadwal">+ Atur jadwal</button></p>';
    } else {
      html += '<div class="mini-list">';
      today.slice(0, 4).forEach(function (c) {
        let right = '';
        if (c._status === 'ongoing') right = '<span class="badge badge-live"><i class="live-dot"></i>Berlangsung</span>';
        else if (c._status === 'upcoming') right = '<span class="badge badge-warn">' + U.esc(U.relTime(c._start)) + '</span>';
        else right = '<span class="badge badge-dim">' + UI.icon('check', 13) + '</span>';
        html += '<div class="mini-item' + (c._status === 'done' ? ' dim' : '') + '">' +
          '<div class="mini-time">' + c.start.replace(':', '.') + '</div>' +
          '<div class="mini-body"><div class="mini-title">' + U.esc(c.course) + '</div>' +
          '<div class="mini-sub">' + (c.room ? U.esc(c.room) : 'Tanpa ruangan') + (c.lecturer ? ' · ' + U.esc(c.lecturer) : '') + '</div></div>' +
          right + '</div>';
      });
      if (today.length > 4) html += '<button class="text-btn full" data-go="jadwal">+' + (today.length - 4) + ' kelas lainnya</button>';
      html += '</div>';
    }
    html += '</section>';

    /* ----- deadline terdekat ----- */
    html += '<section class="card"><div class="card-head">' +
      '<h2>' + UI.icon('clock', 18) + ' Deadline terdekat</h2>' +
      '<button class="text-btn" data-go="tugas">Lihat semua</button></div>';
    if (!active.length) {
      html += '<p class="empty-line">Tidak ada deadline aktif. Lega sekali 😌 <button class="text-btn" data-add-task>+ Tambah tugas</button></p>';
    } else {
      html += '<div class="mini-list">';
      active.slice(0, 4).forEach(function (t) {
        const d = U.parseISO(t.deadline);
        html += '<div class="mini-item" data-edit-task="' + t.id + '">' +
          '<span class="prio-dot prio-' + t.priority + '"></span>' +
          '<div class="mini-body"><div class="mini-title">' + U.esc(t.title) + '</div>' +
          '<div class="mini-sub">' + (t.course ? U.esc(t.course) + ' · ' : '') + (d ? U.smartDate(d) : '-') + '</div></div>' +
          (d ? relBadge(d) : '') + '</div>';
      });
      if (active.length > 4) html += '<button class="text-btn full" data-go="tugas">+' + (active.length - 4) + ' tugas lainnya</button>';
      html += '</div>';
    }
    html += '</section>';

    /* ----- tanya Saku ----- */
    html += '<section class="card card-accent ask-card">' +
      '<div class="card-head"><h2>' + UI.icon('sparkles', 18) + ' Tanya Saku apa saja</h2></div>' +
      '<p class="muted-sm">Materi sulit, rencana belajar, atau suruh aku mencatat tugas & jadwalmu.</p>' +
      '<div class="chip-row">' +
        '<button class="chip" data-ask="Ada kelas apa saja hari ini?">Kelas hari ini?</button>' +
        '<button class="chip" data-ask="Apa deadline tugas yang paling dekat? Kasih saran urutan pengerjaannya.">Deadline terdekat</button>' +
        '<button class="chip" data-ask="Buatkan rencana belajar yang realistis untuk minggu ini berdasarkan tugas dan jadwalku.">Rencana belajar minggu ini</button>' +
      '</div>' +
      '<button class="btn btn-primary full mt-sm" data-go="asisten">' + UI.icon('chat', 18) + ' Buka Asisten</button>' +
    '</section>';

    root.innerHTML = html;

    /* ----- events ----- */
    root.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { SAKU.app.navigate(b.getAttribute('data-go')); });
    });
    root.querySelectorAll('[data-ask]').forEach(function (b) {
      b.addEventListener('click', function () { SAKU.app.askViaChat(b.getAttribute('data-ask')); });
    });
    root.querySelectorAll('[data-add-task]').forEach(function (b) {
      b.addEventListener('click', function () { SAKU.views.tasks.openSheet(null); });
    });
    root.querySelectorAll('[data-edit-task]').forEach(function (el) {
      el.addEventListener('click', function () {
        const t = st.data.tasks.find(function (x) { return x.id === el.getAttribute('data-edit-task'); });
        SAKU.views.tasks.openSheet(t || null);
      });
    });
    const bi = root.querySelector('#btn-install');
    if (bi) bi.addEventListener('click', function () { SAKU.app.promptInstall(); });
    const bx = root.querySelector('#btn-install-x');
    if (bx) bx.addEventListener('click', function () {
      localStorage.setItem('saku.install.dismissed', '1');
      const card = root.querySelector('#install-card');
      if (card) card.remove();
    });
  };

  SAKU.views.home = Home;
})();
