/* ============================================================
 * Saku — Asisten Kuliah AI
 * views/schedule.js — jadwal kuliah mingguan per hari
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui;
  SAKU.views = SAKU.views || {};
  const Schedule = { TICK: true };
  let selectedDay = U.dayIndex(); // default: hari ini

  function classItem(c) {
    const today = U.dayIndex() === c.day;
    let status = '';
    if (today) {
      const now = new Date();
      const s = U.todayAt(c.start), e = U.todayAt(c.end);
      if (now >= s && now <= e) status = '<span class="badge badge-live"><i class="live-dot"></i>Berlangsung</span>';
      else if (now < s) status = '<span class="badge badge-warn">' + U.esc(U.relTime(s)) + '</span>';
    }
    return '<div class="class-item" data-edit="' + c.id + '">' +
      '<div class="class-time"><span>' + c.start.replace(':', '.') + '</span>' +
      '<i></i><span class="muted">' + c.end.replace(':', '.') + '</span></div>' +
      '<div class="class-body">' +
        '<div class="class-title">' + U.esc(c.course) + ' ' + status + '</div>' +
        '<div class="class-sub">' +
          (c.room ? '<span>' + UI.icon('pin', 13) + ' ' + U.esc(c.room) + '</span>' : '') +
          (c.lecturer ? '<span>' + UI.icon('user', 13) + ' ' + U.esc(c.lecturer) + '</span>' : '') +
          (!c.room && !c.lecturer ? '<span class="muted">—</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="chev">' + UI.icon('chevR', 16) + '</span>' +
    '</div>';
  }

  /* ---------- sheet tambah/ubah ---------- */
  Schedule.openSheet = function (cls) {
    const st = SAKU.store;
    const editing = !!cls;
    const dayOpts = U.DAY_NAMES.map(function (name, i) {
      return '<option value="' + i + '"' + ((cls ? cls.day : selectedDay) === i ? ' selected' : '') + '>' + name + '</option>';
    }).join('');

    UI.sheet({
      title: editing ? 'Ubah Jadwal' : 'Jadwal Baru',
      body:
        '<form id="class-form" class="form">' +
          '<label class="field"><span>Mata kuliah</span>' +
            '<input id="f-course" type="text" required maxlength="80" placeholder="mis. Kalkulus I" value="' + U.esc(cls ? cls.course : '') + '"></label>' +
          '<label class="field"><span>Hari</span><select id="f-day">' + dayOpts + '</select></label>' +
          '<div class="row gap">' +
            '<label class="field flex-1"><span>Mulai</span><input id="f-start" type="time" required value="' + U.esc(cls ? cls.start : '08:00') + '"></label>' +
            '<label class="field flex-1"><span>Selesai</span><input id="f-end" type="time" required value="' + U.esc(cls ? cls.end : '09:40') + '"></label>' +
          '</div>' +
          '<label class="field"><span>Ruangan <em class="muted">(opsional)</em></span>' +
            '<input id="f-room" type="text" maxlength="40" placeholder="mis. R.302" value="' + U.esc(cls ? cls.room : '') + '"></label>' +
          '<label class="field"><span>Dosen <em class="muted">(opsional)</em></span>' +
            '<input id="f-lect" type="text" maxlength="60" placeholder="mis. Dr. Budi" value="' + U.esc(cls ? cls.lecturer : '') + '"></label>' +
          '<button type="submit" class="btn btn-primary full">' + (editing ? 'Simpan perubahan' : 'Tambah jadwal') + '</button>' +
          (editing ? '<button type="button" class="btn btn-ghost danger full" id="f-delete">' + UI.icon('trash', 17) + ' Hapus jadwal</button>' : '') +
        '</form>',
      onOpen: function (body, close) {
        if (!editing) setTimeout(function () { body.querySelector('#f-course').focus(); }, 300);

        body.querySelector('#class-form').addEventListener('submit', function (e) {
          e.preventDefault();
          const course = body.querySelector('#f-course').value.trim();
          const day = parseInt(body.querySelector('#f-day').value, 10);
          const start = body.querySelector('#f-start').value;
          const end = body.querySelector('#f-end').value;
          if (!course) { U.toast('Nama mata kuliah wajib diisi', 'error'); return; }
          if (!start || !end || start >= end) { U.toast('Jam selesai harus setelah jam mulai', 'error'); return; }
          const clash = st.classConflict(day, start, end, editing ? cls.id : null);
          const patch = {
            course: course, day: day, start: start, end: end,
            room: body.querySelector('#f-room').value.trim(),
            lecturer: body.querySelector('#f-lect').value.trim()
          };
          if (editing) {
            st.updateClass(cls.id, patch);
            U.toast('Jadwal disimpan', 'success');
          } else {
            selectedDay = day;
            st.addClass(patch);
            U.toast('Jadwal ditambahkan', 'success');
            U.haptic();
          }
          if (clash) {
            U.toast('⚠ Bentrok dengan ' + clash.course + ' (' + clash.start.replace(':','.') + ')', 'error', { duration: 5000 });
          }
          close();
        });

        const del = body.querySelector('#f-delete');
        if (del) del.addEventListener('click', async function () {
          const yes = await UI.confirm({ title: 'Hapus jadwal?', text: '"' + cls.course + '" hari ' + U.DAY_NAMES[cls.day] + ' akan dihapus.', okLabel: 'Hapus', danger: true });
          if (!yes) return;
          const removed = st.removeClass(cls.id);
          close();
          U.toast('Jadwal dihapus', 'info', {
            actionLabel: 'Urungkan',
            onAction: function () { if (removed) st.restoreClass(removed); }
          });
        });
      }
    });
  };

  /* ---------- render utama ---------- */
  Schedule.render = function (root) {
    const st = SAKU.store;
    const total = st.data.classes.length;
    const todayIdx = U.dayIndex();

    let html = '<header class="page-head row-head">' +
      '<div><h1>Jadwal Kuliah</h1><p class="muted">' + total + ' kelas per minggu</p></div>' +
    '</header>';

    // pilihan hari
    html += '<div class="day-strip">';
    U.DAY_SHORT.forEach(function (d, i) {
      const count = st.classesOn(i).length;
      html += '<button class="day-chip' + (i === selectedDay ? ' active' : '') + (i === todayIdx ? ' today' : '') + '" data-day="' + i + '">' +
        '<span>' + d + '</span>' + (count ? '<i>' + count + '</i>' : '') + '</button>';
    });
    html += '</div>';

    const list = st.classesOn(selectedDay);
    if (!list.length) {
      html += '<div class="empty-state"><div class="empty-emoji">🛋️</div>' +
        '<p><strong>' + U.DAY_NAMES[selectedDay] + ' kosong.</strong><br>' +
        '<span class="muted">' + (total ? 'Tidak ada kelas di hari ini.' : 'Belum ada jadwal sama sekali. Yuk isi!') + '</span></p>' +
        '<button class="btn btn-primary" id="empty-add">' + UI.icon('plus', 18) + ' Tambah jadwal</button></div>';
    } else {
      html += '<div class="class-list">' + list.map(classItem).join('') + '</div>';
    }

    html += '<button class="fab" id="fab-add" aria-label="Tambah jadwal">' + UI.icon('plus', 24) + '</button>';
    root.innerHTML = html;

    root.querySelectorAll('.day-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        selectedDay = parseInt(b.getAttribute('data-day'), 10);
        Schedule.render(root);
      });
    });
    root.querySelector('#fab-add').addEventListener('click', function () { Schedule.openSheet(null); });
    const ea = root.querySelector('#empty-add');
    if (ea) ea.addEventListener('click', function () { Schedule.openSheet(null); });
    root.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        const c = st.data.classes.find(function (x) { return x.id === el.getAttribute('data-edit'); });
        if (c) Schedule.openSheet(c);
      });
    });
  };

  SAKU.views.schedule = Schedule;
})();
