/* ============================================================
 * Saku — Asisten Kuliah AI
 * ui.js — komponen bersama: ikon SVG, bottom sheet, konfirmasi
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util;
  const UI = {};

  /* ---------- ikon (konten dalam <svg>) ---------- */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.75V21h5v-6h4v6h5V9.75"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.3-4.9A8.5 8.5 0 1 1 21 11.5z"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 5.5l1 1 2-2.2M4 11.5l1 1 2-2.2M4 17.5l1 1 2-2.2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    sliders: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
    cap: '<path d="M2 9.5 12 4l10 5.5-10 5.5z"/><path d="M6 11.8V16.7c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8v-4.9"/><path d="M22 9.5V15"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.8 14h9.4l.8-14M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L7.5 18.7 3 20l1.3-4.5z"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    bellOff: '<path d="M13.7 4.3A6 6 0 0 0 6 8c0 7-3 8-3 8h12.5M18 8a6 6 0 0 0-1.4-3.8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="M2 2l20 20"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
    sparkles: '<path d="M12 3.5 13.8 8.7 19 10.5 13.8 12.3 12 17.5 10.2 12.3 5 10.5 10.2 8.7z"/><path d="M19 3v3M17.5 4.5h3M5 18v2.6M3.7 19.3h2.6"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>',
    chevL: '<path d="M15 6l-6 6 6 6"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>',
    download: '<path d="M12 3v12M6 9l6 6 6-6"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9"/><path d="M6 15l6-6 6 6"/><path d="M4 3h16"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v6h-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 7.5h.01"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    zap: '<path d="M13 2 3 14h7l-1 8 12-14h-7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    alert: '<path d="M12 3.2 1.8 21h20.4z"/><path d="M12 10v5M12 18.5h.01"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    wifiOff: '<path d="M5 12.5a10 10 0 0 1 3.2-2.3M12 6.5a10 10 0 0 1 7 3M8.5 16a5 5 0 0 1 4.7-1.4M12 19.5h.01"/><path d="M2 2l20 20"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
    pin: '<path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>'
  };

  UI.icon = function (name, size, cls) {
    const inner = ICONS[name] || ICONS.info;
    const s = size || 20;
    return '<svg class="ic ' + (cls || '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
           'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           inner + '</svg>';
  };

  /* ---------- bottom sheet ---------- */
  // opts: { title, body (HTML string), onOpen(bodyEl, close), sheetClass }
  UI.sheet = function (opts) {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.innerHTML =
      '<div class="sheet ' + (opts.sheetClass || '') + '" role="dialog" aria-modal="true">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<h3>' + U.esc(opts.title || '') + '</h3>' +
          '<button class="icon-btn sheet-close" aria-label="Tutup">' + UI.icon('x', 20) + '</button>' +
        '</div>' +
        '<div class="sheet-body">' + (opts.body || '') + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');

    function esc(e) {
      if (e.key === 'Escape') close();
    }

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', esc);
      overlay.classList.remove('open');
      document.body.classList.remove('no-scroll');
      setTimeout(function () { overlay.remove(); }, 240);
    }

    overlay.addEventListener('pointerdown', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('.sheet-close').addEventListener('click', close);
    document.addEventListener('keydown', esc);

    requestAnimationFrame(function () { overlay.classList.add('open'); });
    if (typeof opts.onOpen === 'function') opts.onOpen(overlay.querySelector('.sheet-body'), close);
    return close;
  };

  /* ---------- konfirmasi (promise) ---------- */
  UI.confirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const close = UI.sheet({
        title: opts.title || 'Yakin?',
        sheetClass: 'sheet-sm',
        body:
          '<p class="confirm-text">' + U.esc(opts.text || '') + '</p>' +
          '<div class="row gap mt">' +
            '<button class="btn btn-ghost flex-1" data-a="no">Batal</button>' +
            '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' flex-1" data-a="yes">' +
              U.esc(opts.okLabel || 'Ya') + '</button>' +
          '</div>',
        onOpen: function (body, closeFn) {
          body.querySelector('[data-a="no"]').addEventListener('click', function () { closeFn(); resolve(false); });
          body.querySelector('[data-a="yes"]').addEventListener('click', function () { closeFn(); resolve(true); });
        }
      });
      void close;
    });
  };

  /* ---------- pilihan tersegmentasi ---------- */
  // UI.segGroup(name, options[{value,label}], current) → html
  UI.segGroup = function (name, options, current) {
    return '<div class="seg" data-seg="' + U.esc(name) + '">' +
      options.map(function (o) {
        return '<button type="button" class="seg-item' + (String(o.value) === String(current) ? ' active' : '') +
               '" data-value="' + U.esc(o.value) + '">' + U.esc(o.label) + '</button>';
      }).join('') + '</div>';
  };
  // ambil nilai yg dipilih dari seg; panggil setelah render
  UI.bindSeg = function (rootEl, onChange) {
    const segs = rootEl.querySelectorAll('[data-seg]');
    segs.forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        const btn = e.target.closest('.seg-item');
        if (!btn) return;
        seg.querySelectorAll('.seg-item').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (onChange) onChange(seg.getAttribute('data-seg'), btn.getAttribute('data-value'));
      });
    });
  };
  UI.segValue = function (rootEl, name) {
    const seg = rootEl.querySelector('[data-seg="' + name + '"]');
    if (!seg) return null;
    const active = seg.querySelector('.seg-item.active');
    return active ? active.getAttribute('data-value') : null;
  };

  /* ---------- toggler cantik ---------- */
  UI.switchRow = function (id, label, desc, on) {
    return '<label class="switch-row" for="' + id + '">' +
      '<div class="switch-txt"><div class="switch-label">' + U.esc(label) + '</div>' +
      (desc ? '<div class="switch-desc">' + U.esc(desc) + '</div>' : '') + '</div>' +
      '<input type="checkbox" id="' + id + '" class="switch" ' + (on ? 'checked' : '') + '>' +
      '<span class="switch-ui" aria-hidden="true"></span>' +
      '</label>';
  };

  SAKU.ui = UI;
})();
