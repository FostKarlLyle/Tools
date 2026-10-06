/* ============================================================
 * Saku — Asisten Kuliah AI
 * store.js — state aplikasi + persistensi localStorage + pub/sub
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util;
  const KEY = 'saku.v1';

  const Store = {
    data: null,
    _listeners: [],
    _saveTimer: null,

    /* ---------- defaults ---------- */
    defaults: function () {
      return {
        version: 1,
        profile: { name: '' },
        settings: {
          theme: 'system',          // 'light' | 'dark' | 'system'
          notifEnabled: false,      // niat pengguna mengaktifkan notifikasi
          notifLeadMin: 60,         // menit sebelum deadline tugas
          classLeadMin: 10,         // menit sebelum kelas dimulai
          sound: true,
          ai: {
            provider: 'pollinations',       // 'pollinations' | 'custom'
            model: 'openai',                // model utk pollinations
            baseUrl: '',                    // utk provider custom (OpenAI-compatible)
            apiKey: '',
            customModel: ''
          }
        },
        tasks: [],     // {id,title,course,deadline,priority,notes,done,createdAt,doneAt,notifiedLead,notifiedDue}
        classes: [],   // {id,course,day,start,end,room,lecturer}
        chat: [],      // {id,role,content,ts,acts}
        classNotif: {} // {"YYYY-MM-DD:idKelas": true}
      };
    },

    /* ---------- muat & simpan ---------- */
    load: function () {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
      const d = this.defaults();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // gabung dangkal + per bagian penting agar tahan perubahan versi
          d.profile = Object.assign({}, d.profile, parsed.profile || {});
          d.settings = Object.assign({}, d.settings, parsed.settings || {});
          d.settings.ai = Object.assign({}, this.defaults().settings.ai, (parsed.settings || {}).ai || {});
          d.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
          d.classes = Array.isArray(parsed.classes) ? parsed.classes : [];
          d.chat = Array.isArray(parsed.chat) ? parsed.chat : [];
          d.classNotif = (parsed.classNotif && typeof parsed.classNotif === 'object') ? parsed.classNotif : {};
        } catch (e) { console.warn('[Saku] data rusak, pakai default', e); }
      }
      this.data = d;
      return d;
    },

    save: function () {
      const self = this;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(function () { self.flush(); }, 250);
    },

    flush: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
      catch (e) { console.warn('[Saku] gagal menyimpan', e); }
    },

    /* ---------- pub/sub ---------- */
    onChange: function (fn) { this._listeners.push(fn); },
    emit: function (scope) {
      this.save();
      const s = scope || 'all';
      this._listeners.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
    },

    /* ---------- profil & pengaturan ---------- */
    get name() { return (this.data.profile.name || '').trim(); },
    setName: function (v) { this.data.profile.name = v; this.emit('settings'); },
    settings: function () { return this.data.settings; },
    setSetting: function (path, value) {
      const parts = path.split('.');
      let obj = this.data.settings;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof obj[parts[i]] !== 'object' || obj[parts[i]] === null) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      this.emit('settings');
    },

    /* ---------- TUGAS ---------- */
    addTask: function (t) {
      const task = {
        id: U.uid(),
        title: String(t.title || '').trim() || 'Tugas tanpa judul',
        course: String(t.course || '').trim(),
        deadline: t.deadline || U.toLocalInput(U.addMinutes(new Date(), 120)),
        priority: ['rendah', 'sedang', 'tinggi'].indexOf(t.priority) >= 0 ? t.priority : 'sedang',
        notes: String(t.notes || '').trim(),
        done: false,
        createdAt: Date.now(),
        doneAt: null,
        notifiedLead: false,
        notifiedDue: false
      };
      this.data.tasks.push(task);
      this.emit('tasks');
      return task;
    },

    updateTask: function (id, patch) {
      const t = this.data.tasks.find(function (x) { return x.id === id; });
      if (!t) return null;
      Object.assign(t, patch);
      // deadline berubah → reset pengingat
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'deadline')) {
        t.notifiedLead = false; t.notifiedDue = false;
      }
      this.emit('tasks');
      return t;
    },

    removeTask: function (id) {
      const i = this.data.tasks.findIndex(function (x) { return x.id === id; });
      if (i < 0) return null;
      const removed = this.data.tasks.splice(i, 1)[0];
      this.emit('tasks');
      return removed;
    },

    restoreTask: function (task) {
      if (!task || !task.id) return;
      if (!this.data.tasks.some(function (x) { return x.id === task.id; })) {
        this.data.tasks.push(task);
        this.emit('tasks');
      }
    },

    toggleDone: function (id) {
      const t = this.data.tasks.find(function (x) { return x.id === id; });
      if (!t) return null;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      this.emit('tasks');
      return t;
    },

    findTaskByTitle: function (title) {
      if (!title) return null;
      const q = String(title).trim().toLowerCase();
      const all = this.data.tasks;
      function score(t) {
        const s = t.title.toLowerCase();
        if (s === q) return 3;
        if (s.indexOf(q) >= 0) return 2;
        if (q.indexOf(s) >= 0) return 1;
        return 0;
      }
      let best = null, bestScore = 0;
      all.forEach(function (t) {
        let sc = score(t);
        if (sc > 0 && !t.done) sc += 0.5; // utamakan yang masih aktif
        if (sc > bestScore) { bestScore = sc; best = t; }
      });
      return best;
    },

    activeTasks: function () {
      return this.data.tasks
        .filter(function (t) { return !t.done; })
        .sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
    },

    doneTasks: function () {
      return this.data.tasks
        .filter(function (t) { return t.done; })
        .sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
    },

    /* ---------- JADWAL KELAS ---------- */
    addClass: function (c) {
      const cls = {
        id: U.uid(),
        course: String(c.course || '').trim() || 'Kelas',
        day: U.clamp(parseInt(c.day, 10) || 0, 0, 6),
        start: c.start || '08:00',
        end: c.end || '09:40',
        room: String(c.room || '').trim(),
        lecturer: String(c.lecturer || '').trim()
      };
      this.data.classes.push(cls);
      this.emit('classes');
      return cls;
    },

    updateClass: function (id, patch) {
      const c = this.data.classes.find(function (x) { return x.id === id; });
      if (!c) return null;
      Object.assign(c, patch);
      this.emit('classes');
      return c;
    },

    removeClass: function (id) {
      const i = this.data.classes.findIndex(function (x) { return x.id === id; });
      if (i < 0) return null;
      const removed = this.data.classes.splice(i, 1)[0];
      this.emit('classes');
      return removed;
    },

    restoreClass: function (cls) {
      if (!cls || !cls.id) return;
      if (!this.data.classes.some(function (x) { return x.id === cls.id; })) {
        this.data.classes.push(cls);
        this.emit('classes');
      }
    },

    findClass: function (course, dayName) {
      const q = String(course || '').trim().toLowerCase();
      if (!q) return null;
      let dayIdx = -1;
      if (dayName) {
        const dn = String(dayName).toLowerCase().slice(0, 3);
        const shorts = ['sen', 'sel', 'rab', 'kam', 'jum', 'sab', 'min'];
        dayIdx = shorts.indexOf(dn);
      }
      let best = null, bestScore = 0;
      this.data.classes.forEach(function (c) {
        const s = c.course.toLowerCase();
        let sc = 0;
        if (s === q) sc = 3;
        else if (s.indexOf(q) >= 0 || q.indexOf(s) >= 0) sc = 2;
        if (sc > 0) {
          if (dayIdx >= 0 && c.day === dayIdx) sc += 1;
          if (sc > bestScore) { bestScore = sc; best = c; }
        }
      });
      return best;
    },

    classesOn: function (dayIdx) {
      return this.data.classes
        .filter(function (c) { return c.day === dayIdx; })
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    },

    // kelas hari ini + statusnya
    todayClasses: function () {
      const now = new Date();
      const idx = U.dayIndex(now);
      return this.classesOn(idx).map(function (c) {
        const s = U.todayAt(c.start);
        const e = U.todayAt(c.end);
        let st = 'upcoming';
        if (now >= s && now <= e) st = 'ongoing';
        else if (now > e) st = 'done';
        return Object.assign({}, c, { _start: s, _end: e, _status: st });
      });
    },

    // cek bentrok jadwal di hari yg sama (abaikan id tertentu)
    classConflict: function (day, start, end, ignoreId) {
      const list = this.classesOn(day);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.id === ignoreId) continue;
        if (start < c.end && end > c.start) return c;
      }
      return null;
    },

    /* ---------- CHAT ---------- */
    chatAppend: function (role, content, acts) {
      const msg = { id: U.uid(), role: role, content: content, ts: Date.now() };
      if (acts && acts.length) msg.acts = acts;
      this.data.chat.push(msg);
      if (this.data.chat.length > 80) this.data.chat = this.data.chat.slice(-80);
      this.emit('chat');
      return msg;
    },

    chatUpdate: function (id, patch) {
      const m = this.data.chat.find(function (x) { return x.id === id; });
      if (!m) return null;
      Object.assign(m, patch);
      this.emit('chat');
      return m;
    },

    chatClear: function () {
      this.data.chat = [];
      this.emit('chat');
    },

    /* ---------- Notifikasi kelas (penanda sekali sehari) ---------- */
    classNotified: function (classId) {
      const today = new Date().toDateString() + ':' + classId;
      return !!this.data.classNotif[today];
    },
    markClassNotified: function (classId) {
      const key = new Date().toDateString() + ':' + classId;
      this.data.classNotif[key] = true;
      // buang penanda lama (>2 hari tidak dibersihkan juga tidak apa-apa, tapi rapikan)
      const keys = Object.keys(this.data.classNotif);
      if (keys.length > 200) {
        const self = this;
        keys.slice(0, keys.length - 200).forEach(function (k) { delete self.data.classNotif[k]; });
      }
      this.save();
    },

    /* ---------- Ekspor / impor / hapus ---------- */
    exportJSON: function () {
      return JSON.stringify({
        app: 'saku-asisten-kuliah',
        version: this.data.version,
        exportedAt: new Date().toISOString(),
        profile: this.data.profile,
        settings: this.data.settings,
        tasks: this.data.tasks,
        classes: this.data.classes,
        chat: this.data.chat
      }, null, 2);
    },

    importJSON: function (obj) {
      if (!obj || typeof obj !== 'object') throw new Error('Berkas tidak valid');
      const d = this.defaults();
      d.profile = Object.assign(d.profile, obj.profile || {});
      if (obj.settings) {
        d.settings = Object.assign(d.settings, obj.settings);
        d.settings.ai = Object.assign(this.defaults().settings.ai, obj.settings.ai || {});
      }
      if (Array.isArray(obj.tasks)) {
        d.tasks = obj.tasks.filter(function (t) { return t && t.id && t.title; });
      }
      if (Array.isArray(obj.classes)) {
        d.classes = obj.classes.filter(function (c) { return c && c.id && c.course; });
      }
      if (Array.isArray(obj.chat)) {
        d.chat = obj.chat.filter(function (m) { return m && m.role && typeof m.content === 'string'; }).slice(-80);
      }
      this.data = d;
      this.emit('all');
    },

    wipe: function () {
      this.data = this.defaults();
      this.emit('all');
    }
  };

  Store.load();
  SAKU.store = Store;
})();
