/* ============================================================
 * Saku — Asisten Kuliah AI
 * util.js — helper umum: tanggal, id, DOM, markdown-lite, toast, suara
 * ============================================================ */
(function () {
  'use strict';
  window.SAKU = window.SAKU || {};
  const U = {};

  /* ---------- Konstanta lokal Indonesia ---------- */
  U.DAY_NAMES  = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  U.DAY_SHORT  = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  U.MONTHS     = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
                  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  /* ---------- Dasar ---------- */
  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  U.clamp = function (n, a, b) { return Math.min(b, Math.max(a, n)); };

  U.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  /* ---------- Tanggal & waktu ---------- */
  // index hari: 0 = Senin ... 6 = Minggu
  U.dayIndex = function (d) { d = d || new Date(); return (d.getDay() + 6) % 7; };

  U.pad = function (n) { return String(n).padStart(2, '0'); };

  U.parseISO = function (s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  // format untuk input datetime-local: "YYYY-MM-DDTHH:mm" (waktu lokal)
  U.toLocalInput = function (d) {
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
           'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  U.fmtTime = function (d) {
    if (!(d instanceof Date)) d = new Date(d);
    return U.pad(d.getHours()) + '.' + U.pad(d.getMinutes());
  };

  U.fmtDate = function (d) {
    if (!(d instanceof Date)) d = new Date(d);
    return d.getDate() + ' ' + U.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  };

  U.fmtDayDate = function (d) {
    if (!(d instanceof Date)) d = new Date(d);
    return U.DAY_NAMES[U.dayIndex(d)] + ', ' + U.fmtDate(d);
  };

  U.sameDay = function (a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  U.isToday = function (d) { return U.sameDay(d, new Date()); };
  U.isTomorrow = function (d) { const t = new Date(); t.setDate(t.getDate() + 1); return U.sameDay(d, t); };

  U.addMinutes = function (d, m) { return new Date(d.getTime() + m * 60000); };

  // Date "hari ini" pada jam "HH:mm"
  U.todayAt = function (hhmm, offsetDays) {
    const p = String(hhmm || '00:00').split(':');
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    d.setHours(parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, 0, 0);
    return d;
  };

  // Waktu relatif dalam Bahasa Indonesia
  U.relTime = function (d) {
    if (!(d instanceof Date)) d = new Date(d);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const abs = Math.abs(diff);
    const m = Math.floor(abs / 60000);
    const h = Math.floor(abs / 3600000);
    const day = Math.floor(abs / 86400000);
    let txt;
    if (m < 1) txt = 'baru saja';
    else if (m < 60) txt = m + ' menit';
    else if (h < 24) txt = h + ' jam';
    else if (day < 30) txt = day + ' hari';
    else txt = Math.floor(day / 30) + ' bulan';
    if (diff >= 0) return m < 1 ? 'sekarang' : 'dalam ' + txt + ' lagi';
    return 'terlambat ' + (m < 1 ? 'beberapa detik' : txt);
  };

  // Label tanggal cerdas: "Hari ini 14.00" / "Besok" / "Jumat, 10 Okt"
  U.smartDate = function (d) {
    if (!(d instanceof Date)) d = new Date(d);
    const time = U.fmtTime(d);
    if (U.isToday(d)) return 'Hari ini ' + time;
    if (U.isTomorrow(d)) return 'Besok ' + time;
    return U.DAY_SHORT[U.dayIndex(d)] + ', ' + d.getDate() + ' ' + U.MONTHS[d.getMonth()].slice(0, 3) + ' ' + time;
  };

  U.greeting = function () {
    const h = new Date().getHours();
    if (h >= 4 && h < 11) return 'Selamat pagi';
    if (h >= 11 && h < 15) return 'Selamat siang';
    if (h >= 15 && h < 19) return 'Selamat sore';
    return 'Selamat malam';
  };

  /* ---------- Markdown-lite (aman: escape dulu, lalu pola sederhana) ---------- */
  U.md = function (src) {
    if (!src) return '';
    let txt = U.esc(src);

    // blok kode ``` ... ```
    const blocks = [];
    txt = txt.replace(/```(\w*)\n?([\s\S]*?)```/g, function (m, lang, code) {
      blocks.push('<pre class="code-block"><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '' + (blocks.length - 1) + '';
    });

    const lines = txt.split('\n');
    let html = '', inUL = false, inOL = false;

    function closeLists() {
      if (inUL) { html += '</ul>'; inUL = false; }
      if (inOL) { html += '</ol>'; inOL = false; }
    }

    function inline(s) {
      s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }

    lines.forEach(function (line) {
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      const ul = line.match(/^\s*[-•]\s+(.*)$/);
      const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (h) {
        closeLists();
        html += '<div class="md-h">' + inline(h[2]) + '</div>';
      } else if (ul) {
        if (inOL) { html += '</ol>'; inOL = false; }
        if (!inUL) { html += '<ul class="md-list">'; inUL = true; }
        html += '<li>' + inline(ul[1]) + '</li>';
      } else if (ol) {
        if (inUL) { html += '</ul>'; inUL = false; }
        if (!inOL) { html += '<ol class="md-list">'; inOL = true; }
        html += '<li>' + inline(ol[2]) + '</li>';
      } else if (line.trim() === '') {
        closeLists();
        html += '<div class="md-gap"></div>';
      } else {
        closeLists();
        html += '<div>' + inline(line) + '</div>';
      }
    });
    closeLists();

    // kembalikan blok kode
    html = html.replace(/(\d+)/g, function (m, i) { return blocks[parseInt(i, 10)]; });
    return html;
  };

  /* ---------- Toast ---------- */
  U.toast = function (msg, type, opts) {
    type = type || 'info';
    opts = opts || {};
    let wrap = document.getElementById('toasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toasts';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icons = {
      info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      success: 'M5 13l4 4L19 7',
      error: 'M6 18L18 6M6 6l12 12'
    };
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + icons[type] + '"/></svg>' +
      '<span class="toast-msg">' + U.esc(msg) + '</span>' +
      (opts.actionLabel ? '<button class="toast-act">' + U.esc(opts.actionLabel) + '</button>' : '');
    wrap.appendChild(el);
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      el.querySelector('.toast-act').addEventListener('click', function () {
        opts.onAction();
        dismiss();
      });
    }
    let timer = setTimeout(dismiss, opts.duration || 3600);
    function dismiss() {
      clearTimeout(timer);
      el.classList.add('toast-out');
      setTimeout(function () { el.remove(); }, 260);
    }
    el.addEventListener('click', function (e) {
      if (!e.target.closest('.toast-act')) dismiss();
    });
  };

  /* ---------- Suara notifikasi (WebAudio, tanpa file) ---------- */
  let actx = null;
  U.unlockAudio = function () {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { /* abaikan */ }
  };

  U.chime = function () {
    try {
      if (!actx) U.unlockAudio();
      if (!actx) return;
      const notes = [880, 1174.66]; // A5 → D6, dua nada lembut
      notes.forEach(function (freq, i) {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = actx.currentTime + i * 0.14;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(actx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) { /* abaikan */ }
  };

  U.haptic = function () {
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* abaikan */ }
  };

  /* ---------- Download file ---------- */
  U.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 300);
  };

  SAKU.util = U;
})();
