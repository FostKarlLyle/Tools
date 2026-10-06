/* ============================================================
 * Saku — Asisten Kuliah AI
 * actions.js — mengeksekusi "aksi" yang diminta AI lewat chat
 * (tambah/selesai/hapus tugas, tambah/hapus jadwal)
 * Hasil eksekusi bisa di-undo lewat kartu konfirmasi di chat.
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util;

  const Acts = {};

  const DAY_IDX = { senin: 0, selasa: 1, rabu: 2, kamis: 3, jumat: 4, "jum'at": 4, sabtu: 5, minggu: 6 };

  function dayToIdx(v) {
    if (typeof v === 'number') return U.clamp(Math.round(v), 0, 6);
    const key = String(v || '').trim().toLowerCase();
    if (key in DAY_IDX) return DAY_IDX[key];
    // toleransi awalan: "sen", "kam", dst.
    const short = key.slice(0, 3);
    const shorts = ['sen', 'sel', 'rab', 'kam', 'jum', 'sab', 'min'];
    const i = shorts.indexOf(short);
    return i >= 0 ? i : -1;
  }

  function validHM(s) {
    return typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s.trim());
  }

  function normHM(s) {
    const p = s.trim().split(':');
    return U.pad(parseInt(p[0], 10)) + ':' + U.pad(parseInt(p[1], 10));
  }

  function ok(obj) { return Object.assign({ ok: true }, obj); }
  function fail(label, sub) { return { ok: false, kind: 'error', label: label, sub: sub || '', icon: 'alert', undo: null }; }

  /* ---------- eksekutor per jenis aksi ---------- */
  const EXEC = {
    add_task: function (a) {
      if (!a.title) return fail('Gagal menambah tugas', 'judul kosong');
      let deadline = U.parseISO(a.deadline);
      let note = '';
      if (!deadline) {
        deadline = new Date();
        deadline.setDate(deadline.getDate() + 1);
        deadline.setHours(23, 59, 0, 0);
        note = ' (diasumsikan besok 23.59)';
      }
      const prioMap = { rendah: 'rendah', low: 'rendah', sedang: 'sedang', medium: 'sedang', normal: 'sedang', tinggi: 'tinggi', high: 'tinggi' };
      const prio = prioMap[String(a.priority || 'sedang').toLowerCase()] || 'sedang';
      const task = SAKU.store.addTask({
        title: a.title,
        course: a.course || '',
        deadline: U.toLocalInput(deadline),
        priority: prio,
        notes: a.notes || ''
      });
      return ok({
        kind: 'add_task',
        label: 'Tugas ditambahkan',
        sub: task.title + (task.course ? ' · ' + task.course : '') + ' · ' + U.smartDate(U.parseISO(task.deadline)) + note,
        icon: 'check',
        undo: { kind: 'remove_task', id: task.id }
      });
    },

    complete_task: function (a) {
      const t = SAKU.store.findTaskByTitle(a.title);
      if (!t) return fail('Tugas tidak ditemukan', '"' + (a.title || '') + '"');
      if (t.done) return ok({ kind: 'complete_task', label: 'Tugas sudah selesai sebelumnya', sub: t.title, icon: 'check', undo: null });
      SAKU.store.updateTask(t.id, { done: true, doneAt: Date.now() });
      return ok({
        kind: 'complete_task',
        label: 'Tugas diselesaikan 🎉',
        sub: t.title,
        icon: 'check',
        undo: { kind: 'set_task_done', id: t.id, done: false }
      });
    },

    delete_task: function (a) {
      const t = SAKU.store.findTaskByTitle(a.title);
      if (!t) return fail('Tugas tidak ditemukan', '"' + (a.title || '') + '"');
      const copy = JSON.parse(JSON.stringify(t));
      SAKU.store.removeTask(t.id);
      return ok({
        kind: 'delete_task',
        label: 'Tugas dihapus',
        sub: t.title,
        icon: 'trash',
        undo: { kind: 'restore_task', task: copy }
      });
    },

    add_schedule: function (a) {
      if (!a.course) return fail('Gagal menambah jadwal', 'nama mata kuliah kosong');
      const di = dayToIdx(a.day);
      if (di < 0) return fail('Gagal menambah jadwal', 'hari tidak dikenal: ' + (a.day || '-'));
      if (!validHM(a.start) || !validHM(a.end)) return fail('Gagal menambah jadwal', 'format jam tidak valid');
      const start = normHM(a.start), end = normHM(a.end);
      if (start >= end) return fail('Gagal menambah jadwal', 'jam selesai harus setelah jam mulai');
      const clash = SAKU.store.classConflict(di, start, end, null);
      const cls = SAKU.store.addClass({
        course: a.course, day: di, start: start, end: end,
        room: a.room || '', lecturer: a.lecturer || ''
      });
      return ok({
        kind: 'add_schedule',
        label: 'Jadwal ditambahkan' + (clash ? ' (⚠ bentrok dgn ' + clash.course + ')' : ''),
        sub: cls.course + ' · ' + U.DAY_NAMES[di] + ' ' + cls.start.replace(':','.') + '–' + cls.end.replace(':','.') + (cls.room ? ' @' + cls.room : ''),
        icon: 'calendar',
        undo: { kind: 'remove_class', id: cls.id }
      });
    },

    delete_schedule: function (a) {
      const c = SAKU.store.findClass(a.course, a.day);
      if (!c) return fail('Jadwal tidak ditemukan', (a.course || '-') + ' · ' + (a.day || '-'));
      const copy = JSON.parse(JSON.stringify(c));
      SAKU.store.removeClass(c.id);
      return ok({
        kind: 'delete_schedule',
        label: 'Jadwal dihapus',
        sub: c.course + ' · ' + U.DAY_NAMES[c.day] + ' ' + c.start,
        icon: 'trash',
        undo: { kind: 'restore_class', cls: copy }
      });
    }
  };

  /* ---------- eksekusi daftar aksi ---------- */
  Acts.execute = function (actions) {
    const results = [];
    (actions || []).forEach(function (a) {
      const fn = EXEC[String(a.type || '').toLowerCase()];
      if (!fn) {
        results.push(fail('Aksi tidak dikenal', String(a.type || '?')));
        return;
      }
      try { results.push(fn(a)); }
      catch (e) {
        console.error('[Saku] eksekusi aksi gagal', e);
        results.push(fail('Aksi gagal diproses', String(a.type || '?')));
      }
    });
    return results;
  };

  /* ---------- undo ---------- */
  Acts.applyUndo = function (u) {
    if (!u || !u.kind) return false;
    const st = SAKU.store;
    try {
      switch (u.kind) {
        case 'remove_task': return !!st.removeTask(u.id);
        case 'restore_task': st.restoreTask(u.task); return true;
        case 'set_task_done': return !!st.updateTask(u.id, { done: !!u.done, doneAt: u.done ? Date.now() : null });
        case 'remove_class': return !!st.removeClass(u.id);
        case 'restore_class': st.restoreClass(u.cls); return true;
      }
    } catch (e) { console.error('[Saku] undo gagal', e); }
    return false;
  };

  SAKU.actions = Acts;
})();
