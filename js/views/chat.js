/* ============================================================
 * Saku — Asisten Kuliah AI
 * views/chat.js — percakapan dengan asisten AI + aksi nyata
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui;
  SAKU.views = SAKU.views || {};
  const Chat = { TICK: false, PRESERVE: false };

  let sending = false;
  let draft = '';
  let stickBottom = true;

  const CHIPS = [
    { t: '⏳ Deadline-ku', send: 'Apa deadline tugas yang paling dekat? Kasih saran urutan pengerjaannya.' },
    { t: '📚 Kelas hari ini', send: 'Ada kelas apa saja hari ini?' },
    { t: '＋ Tugas', draft: 'Tambahkan tugas ' },
    { t: '＋ Jadwal', draft: 'Tambahkan jadwal ' },
    { t: '🗓️ Rencana belajar', send: 'Buatkan aku rencana belajar yang realistis untuk minggu ini berdasarkan tugas dan jadwalku.' },
    { t: '🔥 Motivasi', send: 'Aku lagi malas belajar. Kasih motivasi singkat dan trik biar bisa mulai.' }
  ];

  /* ---------- kartu aksi ---------- */
  function actHTML(mid, a, i) {
    const iconName = a.icon || (a.ok ? 'check' : 'alert');
    let right = '';
    if (a.ok && a.undo) {
      right = a.undone
        ? '<span class="act-undone">dibatalkan</span>'
        : '<button class="text-btn" data-undo="' + mid + ':' + i + '">Batalkan</button>';
    }
    return '<div class="act ' + (a.ok ? 'ok' : 'err') + '">' +
      '<span class="act-ic">' + UI.icon(iconName, 16) + '</span>' +
      '<span class="act-txt"><span class="act-label">' + U.esc(a.label) + '</span>' +
      (a.sub ? '<span class="act-sub">' + U.esc(a.sub) + '</span>' : '') + '</span>' +
      right + '</div>';
  }

  /* ---------- gelembung pesan ---------- */
  function msgHTML(m) {
    const time = '<div class="msg-time">' + U.fmtTime(new Date(m.ts)) + '</div>';
    if (m.role === 'user') {
      return '<div class="bubble-row user"><div>' +
        '<div class="bubble user-b">' + U.esc(m.content).replace(/\n/g, '<br>') + '</div>' + time + '</div></div>';
    }
    const acts = (m.acts && m.acts.length)
      ? '<div class="acts">' + m.acts.map(function (a, i) { return actHTML(m.id, a, i); }).join('') + '</div>' : '';
    const retry = m.error ? '<button class="text-btn retry" data-retry>↻ Coba lagi</button>' : '';
    return '<div class="bubble-row ai">' +
      '<div class="avatar">' + UI.icon('cap', 17) + '</div>' +
      '<div><div class="bubble ai-b' + (m.error ? ' err-b' : '') + '">' +
        (m.error ? U.esc(m.content).replace(/\n/g, '<br>') : U.md(m.content)) + acts + retry +
      '</div>' + time + '</div></div>';
  }

  function typingHTML() {
    return '<div class="bubble-row ai">' +
      '<div class="avatar">' + UI.icon('cap', 17) + '</div>' +
      '<div class="bubble ai-b typing"><i></i><i></i><i></i></div></div>';
  }

  function emptyHero() {
    return '<div class="chat-hero">' +
      '<div class="hero-avatar">' + UI.icon('cap', 30) + '</div>' +
      '<h2>Halo! Aku Saku 👋</h2>' +
      '<p class="muted">Asisten AI untuk kuliahmu. Tanya apa saja, atau suruh aku mencatat tugas & jadwal.</p>' +
      '<div class="hero-chips">' +
        '<button class="chip" data-send="Apa deadline tugas yang paling dekat?">⏳ Deadline terdekat</button>' +
        '<button class="chip" data-send="Jelaskan cara menghitung IPK dan tips menaikkannya.">🎓 Cara menghitung IPK</button>' +
        '<button class="chip" data-send="Tambahkan tugas laporan praktikum deadline besok jam 5 sore">✍️ Contoh: catat tugas</button>' +
        '<button class="chip" data-send="Ada kelas apa saja hari ini?">📚 Kelas hari ini</button>' +
      '</div></div>';
  }

  function statusTxt() {
    const cfg = SAKU.store.data.settings.ai;
    if (!navigator.onLine) return 'Offline — AI butuh internet';
    const prov = cfg.provider === 'custom' ? 'API kustom' : 'AI gratis';
    const via = SAKU.ai.lastVia ? ' · via ' + SAKU.ai.lastVia : '';
    return prov + via;
  }

  /* ---------- kirim ---------- */
  function getScroll(root) { return root.querySelector('#chat-scroll'); }

  function scrollBottom(root, smooth) {
    const el = getScroll(root);
    if (!el) return;
    if (smooth && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  }

  function friendlyError(e) {
    if (!navigator.onLine) {
      return 'Internetmu sepertinya terputus 😅 Aku butuh koneksi untuk berpikir. Coba lagi setelah online ya.';
    }
    const msg = (e && e.message) ? e.message : '';
    return 'Maaf, aku gagal menghubungi AI beberapa kali 😅' +
      (msg ? '\n\nDetail: ' + msg + '\n\n' : '\n\n') +
      'Coba lagi sebentar lagi. Kalau tetap gagal, cek Pengaturan → Asisten AI (kamu bisa pakai API kustom milikmu sendiri).';
  }

  async function callAI() {
    const st = SAKU.store;
    try {
      const raw = await SAKU.ai.send();
      const ex = SAKU.ai.extractActions(raw);
      const acts = ex.actions.length ? SAKU.actions.execute(ex.actions) : [];
      const anyOk = acts.some(function (a) { return a.ok; });
      const content = ex.clean || (anyOk ? 'Sudah aku kerjakan ya ✅' : 'Hmm, itu belum bisa kuproses. Coba dijelaskan dengan cara lain?');
      sending = false;
      st.chatAppend('assistant', content, acts);
      if (acts.length) U.haptic();
    } catch (e) {
      console.error('[Saku] AI gagal', e);
      sending = false;
      const m = st.chatAppend('assistant', friendlyError(e));
      st.chatUpdate(m.id, { error: true });
    }
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    sending = true;
    draft = '';
    SAKU.store.chatAppend('user', text); // emit → re-render dgn indikator mengetik
    callAI();
  }

  function retry() {
    if (sending) return;
    const st = SAKU.store;
    const chat = st.data.chat;
    if (chat.length && chat[chat.length - 1].error) chat.pop();
    sending = true;
    st.emit('chat');
    callAI();
  }

  /* ---------- render ---------- */
  Chat.render = function (root) {
    const st = SAKU.store;

    // konsumsi draft dari Beranda
    const app = SAKU.app;
    let autoText = null;
    if (app.pendingDraft) {
      draft = app.pendingDraft;
      if (app.pendingAuto) autoText = app.pendingDraft;
      app.pendingDraft = null;
      app.pendingAuto = false;
    }

    const msgs = st.data.chat;
    let html = '';

    html += '<header class="page-head row-head chat-head">' +
      '<div><h1>Asisten</h1><p class="muted" id="chat-status">' + U.esc(statusTxt()) + '</p></div>' +
      '<button class="icon-btn" id="chat-clear" aria-label="Hapus riwayat" title="Hapus riwayat chat">' + UI.icon('trash', 19) + '</button>' +
    '</header>';

    html += '<div id="chat-scroll">';
    if (!msgs.length && !sending) html += emptyHero();
    else html += msgs.map(msgHTML).join('');
    if (sending) html += typingHTML();
    html += '<div class="chat-pad"></div></div>';

    html += '<div id="chip-bar">' + CHIPS.map(function (c) {
      return '<button class="chip" data-' + (c.send ? 'send' : 'draft') + '="' + U.esc(c.send || c.draft) + '">' + U.esc(c.t) + '</button>';
    }).join('') + '</div>';

    html += '<form id="composer">' +
      '<textarea id="composer-in" rows="1" placeholder="Tulis pesan… mis: catatkan tugas PAW deadline Jumat" ' + (sending ? 'disabled' : '') + '></textarea>' +
      '<button type="submit" class="send-btn" id="composer-send" aria-label="Kirim" disabled>' + UI.icon('send', 19) + '</button>' +
    '</form>';

    root.innerHTML = html;

    /* ----- isi draft & autoresize ----- */
    const ta = root.querySelector('#composer-in');
    const sendBtn = root.querySelector('#composer-send');
    ta.value = draft;
    function autosize() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 132) + 'px';
      sendBtn.disabled = sending || !ta.value.trim();
    }
    ta.addEventListener('input', function () { draft = ta.value; autosize(); });
    autosize();

    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(ta.value);
      }
    });
    root.querySelector('#composer').addEventListener('submit', function (e) {
      e.preventDefault();
      send(ta.value);
    });

    /* ----- chips ----- */
    root.querySelectorAll('#chip-bar [data-send], .chat-hero [data-send]').forEach(function (b) {
      b.addEventListener('click', function () { send(b.getAttribute('data-send')); });
    });
    root.querySelectorAll('#chip-bar [data-draft]').forEach(function (b) {
      b.addEventListener('click', function () {
        draft = b.getAttribute('data-draft');
        ta.value = draft;
        autosize();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    });

    /* ----- hapus riwayat ----- */
    root.querySelector('#chat-clear').addEventListener('click', async function () {
      const yes = await UI.confirm({
        title: 'Hapus riwayat chat?',
        text: 'Semua percakapan dengan Saku akan dihapus. Tugas & jadwal tidak ikut terhapus.',
        okLabel: 'Hapus', danger: true
      });
      if (!yes) return;
      st.chatClear();
      SAKU.app.seedWelcome(true);
      U.toast('Riwayat chat dihapus', 'info');
    });

    /* ----- undo aksi ----- */
    root.querySelectorAll('[data-undo]').forEach(function (b) {
      b.addEventListener('click', function () {
        const parts = b.getAttribute('data-undo').split(':');
        const mid = parts[0], idx = parseInt(parts[1], 10);
        const m = st.data.chat.find(function (x) { return x.id === mid; });
        if (!m || !m.acts || !m.acts[idx] || !m.acts[idx].undo) return;
        const okU = SAKU.actions.applyUndo(m.acts[idx].undo);
        m.acts[idx].undone = true;
        U.toast(okU ? 'Dibatalkan' : 'Gagal membatalkan', okU ? 'info' : 'error');
        st.chatUpdate(mid, { acts: m.acts });
      });
    });

    /* ----- coba lagi ----- */
    root.querySelectorAll('[data-retry]').forEach(function (b) {
      b.addEventListener('click', retry);
    });

    /* ----- scroll ----- */
    const sc = getScroll(root);
    sc.addEventListener('scroll', function () {
      stickBottom = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) < 70;
    });
    scrollBottom(root, false);

    /* ----- auto-send dari Beranda ----- */
    if (autoText) {
      send(autoText);
    }
  };

  SAKU.views.chat = Chat;
})();
