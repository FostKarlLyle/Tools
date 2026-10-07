/* ============================================================
 * Saku — Asisten Kuliah AI
 * ai.js — lapisan AI: prompt sistem + penyedia model (gratis / kustom)
 *
 * Penyedia bawaan: Pollinations (gratis, tanpa API key) dengan
 * tiga lapis cadangan. Pengguna juga bisa memakai endpoint
 * OpenAI-compatible milik sendiri (Groq, OpenRouter, DeepSeek, dll)
 * lewat Pengaturan.
 * ============================================================ */
(function () {
  'use strict';
  const U = SAKU.util;

  const AI = {
    lastError: null,   // info kesalahan terakhir utk UI
    lastVia: null      // endpoint yg berhasil dipakai terakhir
  };

  /* ---------- System prompt (pribadi + konteks data pengguna) ---------- */
  AI.buildSystem = function () {
    const st = SAKU.store.data;
    const now = new Date();
    const name = st.profile.name || 'teman';

    // tugas aktif (maks 15, singkat)
    const aktif = SAKU.store.activeTasks().slice(0, 15).map(function (t) {
      const d = U.parseISO(t.deadline);
      return '- "' + t.title + '"' + (t.course ? ' (' + t.course + ')' : '') +
             (d ? ' deadline ' + U.smartDate(d) + ' [' + U.relTime(d) + ']' : '') +
             ' prioritas ' + t.priority;
    });

    // jadwal mingguan ringkas
    const perHari = [];
    for (let i = 0; i < 7; i++) {
      const list = SAKU.store.classesOn(i);
      if (list.length) {
        perHari.push(U.DAY_NAMES[i] + ': ' + list.map(function (c) {
          return c.course + ' ' + c.start + '-' + c.end + (c.room ? ' @' + c.room : '');
        }).join(', '));
      }
    }

    const lines = [];
    lines.push('Kamu adalah "Saku", asisten AI pribadi untuk mahasiswa Indonesia.');
    lines.push('Waktu sekarang: ' + U.fmtDayDate(now) + ' pukul ' + U.fmtTime(now) + ' (format ISO lokal: ' + U.toLocalInput(now) + ').');
    lines.push('Nama pengguna: ' + name + '.');
    lines.push('');
    lines.push('PERANMU:');
    lines.push('1. Membantu pengguna memecahkan masalah perkuliahan: menjelaskan materi/konsep, strategi belajar, manajemen waktu, persiapan ujian, menulis, dsb.');
    lines.push('2. Menjalankan aksi nyata di aplikasi (tugas & jadwal) — lihat aturan AKSI di bawah.');
    lines.push('');
    lines.push('GAYA BICARA: Bahasa Indonesia santai tapi sopan (panggil pengguna "kamu", jawab dengan "aku"), ringkas dan konkret, boleh sedikit emoji. Kalau jawaban panjang, gunakan poin-poin.');
    lines.push('');
    lines.push('=== ATURAN AKSI (SANGAT PENTING) ===');
    lines.push('Jika pengguna meminta menambah / menyelesaikan / menghapus TUGAS, atau menambah / menghapus JADWAL KULIAH, sertakan SATU blok kode bernama "action" berisi array JSON. Contoh:');
    lines.push('```action');
    lines.push('[{"type":"add_task","title":"Laporan Praktikum 3","course":"Pemrograman Web","deadline":"2026-10-09T23:59","priority":"tinggi"}]');
    lines.push('```');
    lines.push('Jenis aksi yang tersedia:');
    lines.push('- add_task: wajib "title". Opsional: "course", "deadline" (format "YYYY-MM-DDTHH:mm" waktu lokal; jika pengguna tidak menyebut tanggal/waktu, buat asumsi masuk akal dan KATAKAN asumsimu), "priority" ("rendah"|"sedang"|"tinggi"), "notes".');
    lines.push('- complete_task: wajib "title" (samakan dengan judul tugas aktif di data).');
    lines.push('- delete_task: wajib "title".');
    lines.push('- add_schedule: wajib "course", "day" ("senin"|"selasa"|"rabu"|"kamis"|"jumat"|"sabtu"|"minggu"), "start" dan "end" ("HH:mm" 24 jam). Opsional: "room", "lecturer".');
    lines.push('- delete_schedule: wajib "course" dan "day".');
    lines.push('Ketentuan blok action:');
    lines.push('- Isinya HANYA JSON array yang valid, tanpa komentar. Boleh berisi beberapa aksi sekaligus.');
    lines.push('- JANGAN menulis blok action kalau pengguna hanya bertanya atau berdiskusi.');
    lines.push('- Setelah blok action, selalu tulis kalimat konfirmasi singkat yang ramah (contoh: "Sudah aku tambahkan ya ✅").');
    lines.push('=== BATASANMU ===');
    lines.push('Kamu TIDAK bisa mengubah tugas/jadwal di luar jenis aksi di atas. Kalau pengguna minta hal lain (misal mengubah deadline), jelaskan bahwa kamu belum bisa, dan sarankan lakukan manual di menu terkait.');
    lines.push('');
    lines.push('=== DATA PENGGUNA SAAT INI ===');
    lines.push('Tugas aktif (' + aktif.length + '):');
    lines.push(aktif.length ? aktif.join('\n') : '- (tidak ada tugas aktif)');
    lines.push('');
    lines.push('Jadwal kuliah mingguan:');
    lines.push(perHari.length ? perHari.join('\n') : '(belum ada jadwal)');

    return lines.join('\n');
  };

  /* ---------- transport: lewat native Android (kalau ada) atau fetch biasa ---------- */
  // Di aplikasi Android permintaan dikirim lewat jembatan native (SakuHttp) supaya tidak
  // tersangkut batasan origin file:// di WebView (inilah yang bikin chat gagal di APK).
  // Di browser tetap memakai fetch biasa.
  let nativeSeq = 0;
  const nativePending = {};

  window.__sakuHttp = function (id, res) {
    const p = nativePending[id];
    if (!p) return;
    delete nativePending[id];
    res = res || {};
    if (res.error && !res.status) p.reject(new Error('native: ' + res.error));
    else p.resolve({ status: res.status || 0, text: res.body || '' });
  };

  function nativeHttp(method, url, headers, body) {
    return new Promise(function (resolve, reject) {
      if (!window.SakuHttp || typeof window.SakuHttp.post !== 'function') {
        reject(new Error('jembatan native tidak tersedia'));
        return;
      }
      const id = 'r' + (++nativeSeq) + '-' + Date.now();
      const timer = setTimeout(function () {
        if (nativePending[id]) { delete nativePending[id]; reject(new Error('timeout native (70 detik)')); }
      }, 70000);
      nativePending[id] = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };
      try {
        if (method === 'GET') window.SakuHttp.get(id, url, JSON.stringify(headers || {}));
        else window.SakuHttp.post(id, url, JSON.stringify(headers || {}), body || '');
      } catch (e) {
        clearTimeout(timer);
        delete nativePending[id];
        reject(e);
      }
    });
  }

  function fetchHttp(method, url, headers, body, timeoutMs) {
    const h = {};
    Object.keys(headers || {}).forEach(function (k) { if (headers[k]) h[k] = headers[k]; });
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000);
    const opts = { method: method, headers: h, signal: ctrl.signal };
    if (method !== 'GET' && body) opts.body = body;
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) { return { status: res.status, text: text }; });
    }).finally(function () { clearTimeout(t); });
  }

  /**
   * Kirim permintaan HTTP. Selalu mengembalikan { status, text } supaya status bisa
   * dilaporkan apa adanya, dan error jaringan dilempar dengan alasan yang jelas.
   */
  AI.request = async function (method, url, headers, body, timeoutMs) {
    const viaNative = !!(window.SakuHttp && typeof window.SakuHttp.post === 'function');
    let res;
    try {
      res = viaNative
        ? await nativeHttp(method, url, headers, body)
        : await fetchHttp(method, url, headers, body, timeoutMs);
    } catch (e) {
      const msg = (e && e.name === 'AbortError') ? 'timeout' : ((e && e.message) || String(e));
      throw new Error((viaNative ? 'jaringan (native)' : 'jaringan') + ': ' + msg);
    }
    AI.lastTransport = viaNative ? 'native' : 'fetch';
    return res;
  };

  /* ---------- daftar model gratis yang dicoba berurutan ---------- */
  function modelChain(model) {
    const out = [];
    function add(m) {
      m = (m || '').trim();
      if (m && out.indexOf(m) < 0) out.push(m);
    }
    add(model);
    add('openai');
    add('mistral');
    add('openai-fast');
    return out;
  }

  function safeJson(text) {
    const t = (text || '').trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return JSON.parse(t); } catch (e) { return null; }
    }
    return null;
  }

  /* ---------- ekstrak teks dari berbagai bentuk respons ---------- */
  function extractText(data, rawText) {
    if (data && typeof data === 'object') {
      try {
        if (data.choices && data.choices[0]) {
          const c = data.choices[0];
          if (c.message && typeof c.message.content === 'string') return c.message.content;
          if (typeof c.text === 'string') return c.text;
        }
        if (typeof data.content === 'string') return data.content;
        if (typeof data.text === 'string') return data.text;
        if (typeof data.response === 'string') return data.response;
      } catch (e) { /* lanjut ke teks mentah */ }
    }
    return (rawText || '').trim();
  }

  async function parseResponse(res) {
    const txt = await res.text();
    return extractText(safeJson(txt), txt);
  }

  /* ---------- penyedia: Pollinations (gratis, tanpa key) ---------- */
  // Parameter referrer = identitas aplikasi untuk tier anonim (sesuai dokumentasi
  // Pollinations: pemakaian dari aplikasi/browser sebaiknya menyertakan referrer).
  const POLL_REFERRER = 'saku-android';
  const POLL_REF = 'referrer=' + POLL_REFERRER;

  async function viaPollinationsOpenAI(messages, model) {
    const errors = [];
    for (let i = 0; i < modelChain(model).length; i++) {
      const m = modelChain(model)[i];
      const res = await AI.request(
        'POST',
        'https://text.pollinations.ai/openai?' + POLL_REF,
        { 'Content-Type': 'application/json' },
        JSON.stringify({ model: m, messages: messages, temperature: 0.4, referrer: POLL_REFERRER }),
        45000
      );
      if (res.status < 200 || res.status >= 300) { errors.push(m + ' → HTTP ' + res.status); continue; }
      const out = extractText(safeJson(res.text), res.text);
      if (!out) { errors.push(m + ' → respons kosong'); continue; }
      return out;
    }
    throw new Error('model gratis ditolak (' + errors.join('; ') + ')');
  }

  async function viaPollinationsPlain(messages, model) {
    const errors = [];
    const chain = modelChain(model).slice(0, 2);
    for (let i = 0; i < chain.length; i++) {
      const res = await AI.request(
        'POST',
        'https://text.pollinations.ai/?' + POLL_REF,
        { 'Content-Type': 'application/json' },
        JSON.stringify({ model: chain[i], messages: messages, referrer: POLL_REFERRER }),
        45000
      );
      if (res.status < 200 || res.status >= 300) { errors.push(chain[i] + ' → HTTP ' + res.status); continue; }
      const out = (res.text || '').trim();
      if (!out) { errors.push(chain[i] + ' → respons kosong'); continue; }
      return out;
    }
    throw new Error('jalur teks ditolak (' + errors.join('; ') + ')');
  }

  async function viaPollinationsGET(system, messages, model) {
    // cadangan terakhir: ringkas percakapan jadi satu prompt (batas panjang URL)
    let convo = '';
    messages.slice(-8).forEach(function (m) {
      convo += (m.role === 'user' ? 'Pengguna' : 'Asisten') + ': ' + m.content + '\n\n';
    });
    convo += 'Asisten:';
    let prompt = system + '\n\n=== Percakapan ===\n' + convo;
    if (prompt.length > 6000) prompt = prompt.slice(0, 2000) + '\n...\n' + prompt.slice(-3800);
    const errors = [];
    const chain = modelChain(model).slice(0, 2);
    for (let i = 0; i < chain.length; i++) {
      const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) +
                  '?model=' + encodeURIComponent(chain[i]) + '&' + POLL_REF;
      const res = await AI.request('GET', url, {}, null, 45000);
      if (res.status < 200 || res.status >= 300) { errors.push(chain[i] + ' → HTTP ' + res.status); continue; }
      const out = (res.text || '').trim();
      if (!out) { errors.push(chain[i] + ' → respons kosong'); continue; }
      return out;
    }
    throw new Error('jalur GET ditolak (' + errors.join('; ') + ')');
  }

  /* ---------- penyedia: kustom (OpenAI-compatible) ---------- */
  async function viaCustom(messages, cfg) {
    const base = (cfg.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Base URL belum diisi. Atur di Pengaturan → AI.');
    const res = await AI.request(
      'POST',
      base + '/chat/completions',
      {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (cfg.apiKey || '')
      },
      JSON.stringify({
        model: (cfg.customModel || '').trim() || 'gpt-4o-mini',
        messages: messages,
        temperature: 0.4
      }),
      45000
    );
    if (res.status < 200 || res.status >= 300) {
      let extra = '';
      const j = safeJson(res.text);
      if (j && j.error && j.error.message) extra = ': ' + j.error.message;
      else if (res.text) extra = ': ' + res.text.slice(0, 160);
      throw new Error('HTTP ' + res.status + extra);
    }
    const out = extractText(safeJson(res.text), res.text);
    if (!out) throw new Error('Respons kosong');
    return out;
  }

  /* ---------- kirim pesan: susun histori + coba penyedia berlapis ---------- */
  AI.send = async function () {
    const cfg = SAKU.store.data.settings.ai;
    const system = AI.buildSystem();

    // histori: maks 24 pesan terakhir, jawaban AI dipotong agar hemat token
    const history = SAKU.store.data.chat.slice(-24).map(function (m) {
      let content = m.content || '';
      if (m.role === 'assistant' && content.length > 1200) content = content.slice(0, 1200) + '…';
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: content };
    });

    const messages = [{ role: 'system', content: system }].concat(history);
    AI.lastError = null;

    const attempts = [];
    if (cfg.provider === 'custom') {
      attempts.push(['API kustom', function () { return viaCustom(messages, cfg); }]);
    }
    // Pollinations selalu jadi cadangan (kecuali kalau provider=custom DAN user mematikan fallback? — biarkan selalu fallback)
    attempts.push(['Pollinations', function () { return viaPollinationsOpenAI(messages, cfg.model); }]);
    attempts.push(['Pollinations (teks)', function () { return viaPollinationsPlain(messages, cfg.model); }]);
    attempts.push(['Pollinations (GET)', function () { return viaPollinationsGET(system, history, cfg.model); }]);

    let err = null;
    const gagalDi = [];
    for (let i = 0; i < attempts.length; i++) {
      try {
        const out = await attempts[i][1]();
        AI.lastVia = attempts[i][0];
        return out;
      } catch (e) {
        err = e;
        const msg = (e && e.name === 'AbortError') ? 'timeout (45 detik)' : (e && e.message) || String(e);
        gagalDi.push(attempts[i][0] + ': ' + msg);
        console.warn('[Saku AI] gagal via ' + attempts[i][0] + ':', msg);
      }
    }
    AI.lastError = err;
    AI.lastDetail = gagalDi.join(' | ');
    throw err || new Error('Semua jalur AI gagal');
  };

  /* ---------- tes koneksi (dipakai di Pengaturan) ---------- */
  // Mengembalikan rincian tiap jalur supaya jelas jalur mana yang gagal dan kenapa.
  AI.test = async function () {
    const cfg = SAKU.store.data.settings.ai;
    const probe = [{ role: 'user', content: 'Balas dengan satu kata: OK' }];
    const sys = [{ role: 'system', content: 'Kamu asisten uji koneksi. Jawab sangat singkat.' }];
    const t0 = Date.now();
    const detail = [];

    const chain = [];
    if (cfg.provider === 'custom') chain.push(['API kustom', function () { return viaCustom(sys.concat(probe), cfg); }]);
    chain.push(['Pollinations', function () { return viaPollinationsOpenAI(sys.concat(probe), cfg.model); }]);
    chain.push(['Pollinations (teks)', function () { return viaPollinationsPlain(sys.concat(probe), cfg.model); }]);

    for (let i = 0; i < chain.length; i++) {
      try {
        const out = await chain[i][1]();
        detail.push('✅ ' + chain[i][0] + ' berhasil');
        return {
          ok: true,
          ms: Date.now() - t0,
          via: chain[i][0],
          sample: (out || '').slice(0, 80),
          transport: AI.lastTransport || '-',
          detail: detail
        };
      } catch (e) {
        detail.push('❌ ' + chain[i][0] + ': ' + ((e && e.message) || 'gagal'));
      }
    }
    const err = new Error(detail.join('\n'));
    err.detail = detail;
    err.transport = AI.lastTransport || '-';
    throw err;
  };

  /* ---------- ambil blok aksi dari jawaban AI ---------- */
  AI.extractActions = function (text) {
    const actions = [];
    let clean = text || '';
    const re = /```action\s*([\s\S]*?)```/i;
    let m;
    while ((m = clean.match(re))) {
      try {
        const parsed = JSON.parse(m[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach(function (a) {
            if (a && typeof a === 'object' && a.type) actions.push(a);
          });
        } else if (parsed && typeof parsed === 'object' && parsed.type) {
          actions.push(parsed);
        }
      } catch (e) {
        console.warn('[Saku] blok action tidak valid', e);
      }
      clean = clean.replace(re, '');
    }
    // buang blok kode bernama action yang gagal di-parse pun tetap bersih
    clean = clean.replace(/```(?:json)?\s*\[\s*\{\s*"type"\s*:\s*"(?:add_task|complete_task|delete_task|add_schedule|delete_schedule)"[\s\S]*?```/i, '');
    clean = clean.trim();
    return { clean: clean, actions: actions };
  };

  SAKU.ai = AI;
})();
