# Saku — Asisten Kuliah AI 🎓

Tools web (PWA) yang membantu kuliahmu: **asisten AI yang selalu siap di HP**, bisa diajak diskusi, sekaligus bisa **menjalankan tugas nyata** — mencatat tugas, mengatur jadwal kuliah, dan mengingatkan deadline.

> Bahasa: Indonesia · Gaya: minimal & clean · Mobile-first

## 📱 Dua rasa: PWA & Aplikasi Android

- **PWA** (folder root) — buka di browser, instal ke layar utama, jalan di mana-mana.
- **Aplikasi Android** (`android/`) — membungkus PWA + **bubble maskot anime** yang melayang di atas aplikasi lain (tap → chat!). APK di-build otomatis via GitHub Actions. Lihat **[docs/ANDROID.md](docs/ANDROID.md)**.

---

## ✨ Fitur

### 🤖 Asisten (Chat AI)
- Ngobrol bebas: jelaskan materi, cara hitung IPK, rencana belajar, motivasi, dsb.
- **Aksi nyata lewat bahasa natural**, misalnya:
  - *"Tambahkan tugas laporan praktikum deadline Jumat jam 5 sore"*
  - *"Tambahkan jadwal Kalkulus tiap Senin 08.00–09.40 di R.302"*
  - *"Tandai tugas laporan praktikum selesai"*
  - *"Tugas apa yang paling dekat deadline?"* (AI menjawab dari data aslimu)
- Setiap aksi muncul sebagai **kartu konfirmasi** dengan tombol **Batalkan** (undo).
- **Gratis tanpa API key** (Pollinations, dengan 3 lapis cadangan otomatis).
- Bisa pakai **API kustom** milikmu sendiri (Groq, OpenRouter, DeepSeek, Gemini, dll) — atur di Pengaturan → Asisten AI.
- Riwayat chat tersimpan lokal; render markdown ringan (poin-poin, kode, tebal).

### ✅ Tugas
- Deadline + prioritas (rendah/sedang/tinggi) + mata kuliah + catatan.
- Digelompokkan otomatis: **Terlambat / Hari ini / Besok / 7 hari / Nanti / Selesai**.
- Badge hitung mundur ("dalam 2 jam lagi", "terlambat 1 hari").
- Selesaikan dengan satu ketukan; hapus dengan opsi **Urungkan**.

### 📅 Jadwal Kuliah
- Jadwal mingguan per hari (Senin–Minggu) + ruangan & dosen.
- Penanda **"Berlangsung"** real-time dan hitung mundur kelas berikutnya.
- Peringatan otomatis kalau ada jadwal yang **bentrok**.

### 🔔 Notifikasi & Pengingat
- Pengingat deadline tugas (30 menit / 1 jam / 3 jam / 1 hari sebelum, bisa diatur).
- Pengingat kelas sebelum mulai (5–30 menit).
- Notifikasi sistem (Web Notification API) + nada lembut + getar; ada juga *app badge* jumlah tugas mendesak.
- Catatan: pengingat bekerja saat aplikasi terbuka. Karena ini PWA murni tanpa server push, biasakan membuka aplikasinya sesekali di HP.

### 📱 PWA — "selalu di layar HP"
- Bisa **dipasang ke layar utama** Android & iOS (Add to Home Screen), terasa seperti aplikasi native.
- **Offline-ready**: seluruh antarmuka berfungsi tanpa internet (chat AI tetap butuh internet).
- Tema **terang / gelap / ikut sistem**.
- Semua data di **localStorage** perangkatmu — plus ekspor/impor cadangan JSON.

---

## 🚀 Menjalankan

Aplikasi ini 100% statis (tanpa proses build). Jalankan server statis apa pun dari folder repo:

```bash
python3 serve.py        # server bawaan repo (port 8000)
# atau: npx serve .  /  php -S localhost:8000
```

Lalu buka `http://localhost:8000`.

## 🌐 Deploy (supaya bisa dipasang di HP)

PWA butuh **HTTPS**. Hosting statis gratis yang cocok (drag & drop folder ini):

- **GitHub Pages** — Settings → Pages → deploy from branch.
- **Netlify / Vercel / Cloudflare Pages** — pilih repo ini, tanpa build command.

Setelah online:
- **Android (Chrome)**: menu ⋮ → **Instal aplikasi** / *Add to Home screen*.
- **iPhone (Safari)**: tombol **Bagikan** → **Tambahkan ke Layar Utama**.

## ⚙️ Konfigurasi AI kustom (opsional)

Pengaturan → Asisten AI → **API Kustom**, contoh:

| Provider | Base URL | Model |
|---|---|---|
| Groq (gratis) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |

API key hanya disimpan di perangkatmu. Mode gratis (Pollinations) tetap menjadi cadangan otomatis bila API kustom gagal.

---

## 🗂️ Struktur

```
index.html              # shell aplikasi
manifest.webmanifest    # metadata PWA
sw.js                   # service worker (offline + klik notifikasi)
serve.py                # server dev statis
styles/app.css          # tema minimal (terang/gelap) via CSS variables
js/
  util.js               # tanggal id-ID, markdown-lite, toast, suara, dsb.
  store.js              # state + localStorage + pub/sub
  ui.js                 # ikon SVG, bottom sheet, dialog, segmented control
  ai.js                 # prompt sistem + provider AI (gratis & kustom, berlapis cadangan)
  actions.js            # eksekusi aksi dari chat + undo
  app.js                # router hash, nav, pengingat, notifikasi, install PWA
  views/                # home, chat (asisten), tasks, schedule, settings
icons/                  # ikon PWA 32–512px + maskable
```

## 🔒 Privasi

Tidak ada server aplikasi & tidak ada pelacakan. Data tugas/jadwal/chat/api-key hanya tersimpan di `localStorage` perangkatmu sendiri. Saat chat, isi percakapan + ringkasan tugas/jadwalmu dikirim ke penyedia AI yang kamu pilih (default: Pollinations) untuk menjawab.

## 💡 Ide pengembangan berikutnya

- Kalkulator IPK/IPS terintegrasi
- Catatan belajar & flashcards buatan AI
- Sinkronisasi cloud opsional (login) & push notification beneran via server
- Widget streak belajar & timer pomodoro
