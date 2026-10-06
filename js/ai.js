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

  /* ---------- fetch dengan timeout ---------- */
  function fetchTimeout(url, opts, ms) {
    opts = opts || {};
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, ms || 45000);
    opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(t); });
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
    let data = null;
    const trimmed = txt.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { data = JSON.parse(trimmed); } catch (e) { /* biarkan null */ }
    }
    return extractText(data, trimmed);
  }

  /* ---------- penyedia: Pollinations (gratis, tanpa key) ---------- */
  async function viaPollinationsOpenAI(messages, model) {
    const res = await fetchTimeout('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'openai', messages: messages, temperature: 0.4 })
    }, 45000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const out = await parseResponse(res);
    if (!out) throw new Error('Respons kosong');
    return out;
  }

  async function viaPollinationsPlain(messages, model) {
    const res = await fetchTimeout('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'openai', messages: messages })
    }, 45000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const out = (await res.text()).trim();
    if (!out) throw new Error('Respons kosong');
    return out;
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
    const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) +
                '?model=' + encodeURIComponent(model || 'openai');
    const res = await fetchTimeout(url, {}, 45000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const out = (await res.text()).trim();
    if (!out) throw new Error('Respons kosong');
    return out;
  }

  /* ---------- penyedia: kustom (OpenAI-compatible) ---------- */
  async function viaCustom(messages, cfg) {
    const base = (cfg.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Base URL belum diisi. Atur di Pengaturan → AI.');
    const res = await fetchTimeout(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (cfg.apiKey || '')
      },
      body: JSON.stringify({
        model: (cfg.customModel || '').trim() || 'gpt-4o-mini',
        messages: messages,
        temperature: 0.4
      })
    }, 45000);
    if (!res.ok) {
      let extra = '';
      try { const j = await res.json(); extra = (j.error && j.error.message) ? ': ' + j.error.message : ''; } catch (e) {}
      throw new Error('HTTP ' + res.status + extra);
    }
    const out = await parseResponse(res);
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
    for (let i = 0; i < attempts.length; i++) {
      try {
        const out = await attempts[i][1]();
        AI.lastVia = attempts[i][0];
        return out;
      } catch (e) {
        err = e;
        const msg = (e && e.name === 'AbortError') ? 'timeout (45 detik)' : (e && e.message) || String(e);
        console.warn('[Saku AI] gagal via ' + attempts[i][0] + ':', msg);
      }
    }
    AI.lastError = err;
    throw err || new Error('Semua jalur AI gagal');
  };

  /* ---------- tes koneksi (dipakai di Pengaturan) ---------- */
  AI.test = async function () {
    const cfg = SAKU.store.data.settings.ai;
    const probe = [{ role: 'user', content: 'Balas dengan satu kata: OK' }];
    const t0 = Date.now();
    if (cfg.provider === 'custom') {
      const out = await viaCustom([{ role: 'system', content: 'Kamu asisten uji koneksi.' }].concat(probe), cfg);
      return { ok: true, ms: Date.now() - t0, via: 'API kustom', sample: (out || '').slice(0, 80) };
    }
    const out = await viaPollinationsOpenAI(
      [{ role: 'system', content: 'Kamu asisten uji koneksi. Jawab sangat singkat.' }].concat(probe), cfg.model);
    return { ok: true, ms: Date.now() - t0, via: 'Pollinations', sample: (out || '').slice(0, 80) };
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
