/* ============================================================
 * Saku — Asisten Kuliah AI
 * views/tasks.js — daftar tugas: grup waktu, filter, tambah/ubah
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util, UI = SAKU.ui;
  SAKU.views = SAKU.views || {};
  const Tasks = { TICK: true };
  let filter = 'aktif'; // 'aktif' | 'semua' | 'selesai'

  const PRIO_LBL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };

  function groupOf(d, now) {
    if (d < now) return 0;                                   // terlambat
    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    if (d <= endToday) return 1;                             // hari ini
    const tom = new Date(now); tom.setDate(tom.getDate() + 1); tom.setHours(23, 59, 59, 999);
    if (d <= tom) return 2;                                  // besok
    const week = new Date(now); week.setDate(week.getDate() + 7);
    if (d <= week) return 3;                                 // 7 hari
    return 4;                                                // nanti
  }
  const GROUPS = [
    { key: 0, label: '🔥 Terlambat' },
    { key: 1, label: 'Hari ini' },
    { key: 2, label: 'Besok' },
    { key: 3, label: '7 hari ke depan' },
    { key: 4, label: 'Nanti' }
  ];

  function taskItem(t) {
    const d = U.parseISO(t.deadline);
    const late = d && d < new Date() && !t.done;
    return '<div class="task' + (t.done ? ' done' : '') + '">' +
      '<button class="check' + (t.done ? ' on' : '') + '" data-toggle="' + t.id + '" aria-label="Tandai selesai">' +
        UI.icon('check', 14) + '</button>' +
      '<div class="task-main" data-edit="' + t.id + '">' +
        '<div class="task-title">' + U.esc(t.title) + '</div>' +
        '<div class="task-meta">' +
          '<span class="prio-dot prio-' + t.priority + '"></span>' + PRIO_LBL[t.priority] +
          (t.course ? ' · <span class="meta-course">' + U.esc(t.course) + '</span>' : '') +
          (d ? ' · <span class="' + (late ? 'late' : '') + '">' + U.smartDate(d) + ' (' + U.relTime(d) + ')</span>' : '') +
        '</div>' +
        (t.notes ? '<div class="task-notes">' + U.esc(t.notes) + '</div>' : '') +
      '</div>' +
      '<button class="icon-btn task-more" data-edit="' + t.id + '" aria-label="Ubah">' + UI.icon('edit', 17) + '</button>' +
    '</div>';
  }

  function listHTML() {
    const st = SAKU.store;
    const act = st.activeTasks();
    const done = st.doneTasks();
    let html = '';
    if (filter !== 'selesai') {
      if (!act.length) {
        html += '<div class="empty-state"><div class="empty-emoji">🎉</div>' +
          '<p><strong>Tidak ada tugas aktif.</strong><br><span class="muted">Santai, atau tambah tugas baru biar tidak kelewat.</span></p>' +
          '<button class="btn btn-primary" id="empty-add">' + UI.icon('plus', 18) + ' Tambah tugas</button></div>';
      } else {
        const now = new Date();
        const buckets = [[], [], [], [], []];
        act.forEach(function (t) {
          const d = U.parseISO(t.deadline);
          buckets[d ? groupOf(d, now) : 4].push(t);
        });
        GROUPS.forEach(function (g) {
          const list = buckets[g.key];
          if (!list.length) return;
          html += '<div class="group-head">' + g.label + ' <span class="muted">' + list.length + '</span></div>';
          html += list.map(taskItem).join('');
        });
      }
    }
    if (filter !== 'aktif') {
      if (done.length) {
        html += '<div class="group-head">✅ Selesai <span class="muted">' + done.length + '</span></div>';
        html += done.slice(0, 30).map(taskItem).join('');
        if (done.length > 30) html += '<p class="muted center">+' + (done.length - 30) + ' lainnya</p>';
      } else if (filter === 'selesai') {
        html += '<div class="empty-state"><div class="empty-emoji">📭</div>' +
          '<p><span class="muted">Belum ada tugas yang diselesaikan.</span></p></div>';
      }
    }
    return html;
  }

  /* ---------- sheet tambah/ubah ---------- */
  Tasks.openSheet = function (task) {
    const st = SAKU.store;
    const editing = !!task;
    const courseSet = {};
    st.data.tasks.forEach(function (t) { if (t.course) courseSet[t.course] = 1; });
    st.data.classes.forEach(function (c) { if (c.course) courseSet[c.course] = 1; });
    const courses = Object.keys(courseSet);

    const def = new Date();
    def.setDate(def.getDate() + 1);
    def.setHours(18, 0, 0, 0);

    UI.sheet({
      title: editing ? 'Ubah Tugas' : 'Tugas Baru',
      body:
        '<form id="task-form" class="form">' +
          '<label class="field"><span>Judul tugas</span>' +
            '<input id="f-title" type="text" required maxlength="120" placeholder="mis. Laporan Praktikum Bab 3" value="' + U.esc(task ? task.title : '') + '"></label>' +
          '<label class="field"><span>Mata kuliah</span>' +
            '<input id="f-course" type="text" list="dl-courses" maxlength="60" placeholder="mis. Pemrograman Web" value="' + U.esc(task ? task.course : '') + '">' +
            '<datalist id="dl-courses">' + courses.map(function (c) { return '<option value="' + U.esc(c) + '">'; }).join('') + '</datalist></label>' +
          '<label class="field"><span>Deadline</span>' +
            '<input id="f-deadline" type="datetime-local" required value="' + U.esc(task ? task.deadline : U.toLocalInput(def)) + '"></label>' +
          '<div class="field"><span>Prioritas</span>' +
            UI.segGroup('prio', [
              { value: 'rendah', label: 'Rendah' },
              { value: 'sedang', label: 'Sedang' },
              { value: 'tinggi', label: 'Tinggi' }
            ], task ? task.priority : 'sedang') + '</div>' +
          '<label class="field"><span>Catatan <em class="muted">(opsional)</em></span>' +
            '<textarea id="f-notes" rows="2" maxlength="500" placeholder="Detail, link pengumpulan, dsb.">' + U.esc(task ? task.notes : '') + '</textarea></label>' +
          '<button type="submit" class="btn btn-primary full">' + (editing ? 'Simpan perubahan' : 'Tambah tugas') + '</button>' +
          (editing ? '<button type="button" class="btn btn-ghost danger full" id="f-delete">' + UI.icon('trash', 17) + ' Hapus tugas</button>' : '') +
        '</form>',
      onOpen: function (body, close) {
        UI.bindSeg(body);
        const titleEl = body.querySelector('#f-title');
        setTimeout(function () { if (!editing) titleEl.focus(); }, 300);

        body.querySelector('#task-form').addEventListener('submit', function (e) {
          e.preventDefault();
          const title = titleEl.value.trim();
          if (!title) { U.toast('Judul tidak boleh kosong', 'error'); return; }
          const dl = U.parseISO(body.querySelector('#f-deadline').value);
          if (!dl) { U.toast('Tanggal deadline tidak valid', 'error'); return; }
          const patch = {
            title: title,
            course: body.querySelector('#f-course').value.trim(),
            deadline: U.toLocalInput(dl),
            priority: UI.segValue(body, 'prio') || 'sedang',
            notes: body.querySelector('#f-notes').value.trim()
          };
          if (editing) {
            st.updateTask(task.id, patch);
            U.toast('Tugas disimpan', 'success');
          } else {
            st.addTask(patch);
            U.toast('Tugas ditambahkan', 'success');
            U.haptic();
          }
          close();
        });

        const del = body.querySelector('#f-delete');
        if (del) del.addEventListener('click', async function () {
          const yes = await UI.confirm({ title: 'Hapus tugas?', text: '"' + task.title + '" akan dihapus permanen.', okLabel: 'Hapus', danger: true });
          if (!yes) return;
          const removed = st.removeTask(task.id);
          close();
          U.toast('Tugas dihapus', 'info', {
            actionLabel: 'Urungkan',
            onAction: function () { if (removed) st.restoreTask(removed); }
          });
        });
      }
    });
  };

  /* ---------- render utama ---------- */
  Tasks.render = function (root) {
    const st = SAKU.store;
    const n = st.activeTasks().length;

    let html = '<header class="page-head row-head">' +
      '<div><h1>Tugas</h1><p class="muted">' + n + ' tugas aktif</p></div>' +
    '</header>';
    html += '<div class="seg-wrap">' + UI.segGroup('filter', [
      { value: 'aktif', label: 'Aktif' },
      { value: 'semua', label: 'Semua' },
      { value: 'selesai', label: 'Selesai' }
    ], filter) + '</div>';
    html += '<div id="task-list">' + listHTML() + '</div>';
    html += '<button class="fab" id="fab-add" aria-label="Tambah tugas">' + UI.icon('plus', 24) + '</button>';

    root.innerHTML = html;

    UI.bindSeg(root, function (name, value) {
      if (name === 'filter') {
        filter = value;
        Tasks.render(root);
      }
    });

    root.querySelector('#fab-add').addEventListener('click', function () { Tasks.openSheet(null); });

    const ea = root.querySelector('#empty-add');
    if (ea) ea.addEventListener('click', function () { Tasks.openSheet(null); });

    root.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        const t = st.toggleDone(b.getAttribute('data-toggle'));
        if (!t) return;
        U.haptic();
        if (t.done) {
          U.toast('Tugas selesai 🎉', 'success', {
            actionLabel: 'Urungkan',
            onAction: function () { st.toggleDone(t.id); }
          });
        }
      });
    });

    root.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        const t = st.data.tasks.find(function (x) { return x.id === el.getAttribute('data-edit'); });
        if (t) Tasks.openSheet(t);
      });
    });
  };

  SAKU.views.tasks = Tasks;
})();
