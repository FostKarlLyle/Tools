# Saku untuk Android 🤖 — Aplikasi + Bubble Maskot Anime

Aplikasi Android native yang membungkus PWA Saku (WebView), dilengkapi **bubble maskot anime** yang melayang di atas aplikasi apa pun — seperti Shimeji, tapi dia juga asisten kuliahmu.

```
┌─────────────────────────────┐
│  Aplikasi Saku (WebView)    │     ◯ ← bubble maskot melayang
│  ─ Chat AI, tugas, jadwal   │       di atas aplikasi lain
│  ─ Bridge native (SakuNative)│      tap → buka chat
│  BubbleService (overlay)    │       tahan → pengaturan
└─────────────────────────────┘       drag → geser & nempel di tepi
```

## 📥 Cara mendapatkan APK (tanpa laptop!)

APK di-build otomatis di cloud setiap ada perubahan kode, lewat GitHub Actions.

**Cara paling gampang — GitHub Releases:**

1. Buka repo ini di GitHub → **Releases** (halaman `/releases`)
   > Catatan: setiap build ditandai *pre-release*, jadi belum ada label "Latest" — pilih rilis dengan **tag `build-<nomor>` paling besar**.
2. Unduh **`saku-android.apk`** dari rilis **terbaru** itu
3. Buka file itu di HP → izinkan **"Install dari sumber tidak dikenal"** → install
4. Buka aplikasi → **Pengaturan → Bubble Maskot** → pastikan tertulis **"Versi aplikasi Android: v…"** yang sesuai rilis terbaru

**Alternatif — tab Actions (artifact):**

1. Tab **Actions** → klik run **"Build Android APK"** terbaru (status hijau ✅)
2. Scroll ke bawah → **Artifacts** → unduh **saku-apk**
3. Isinya berupa ZIP — ekstrak dulu, file di dalamnya bernama `app-debug.apk`

> ⚠️ Penting: artifact APK **tidak bisa di-install sebelum di-ekstrak**, dan artifact dari run lama tetap berisi APK lama. Kalau masih ragu, pakai rilis terbaru dan cek nomor versinya di dalam aplikasi.

> Kamu juga bisa memicu build manual: tab Actions → "Build Android APK" → **Run workflow**.
>
> **Update APK:** sejak versi dengan tanda tangan tetap, update cukup **ditimpa** (install di atas aplikasi lama) — data tidak hilang. Kalau kamu menginstall APK dari build paling awal (sebelum tanda tangan ditetapkan), **uninstall dulu sekali saja**, lalu install APK baru.

## 🫧 Mengaktifkan bubble maskot

1. Buka aplikasi Saku → izinkan **notifikasi** saat diminta
2. Masuk ke **Pengaturan → Bubble Maskot**
3. Ketuk **Izinkan overlay** → di pengaturan sistem, aktifkan "Tampil di atas aplikasi lain" untuk Saku
4. Kembali ke aplikasi → nyalakan saklar **Tampilkan bubble maskot**
5. Selesai! Maskot muncul di layar dan tetap ada di atas aplikasi lain

**Animasi bubble (berjalan sendiri, tidak perlu disentuh):**
- karakter naik-turun halus + goyang kecil di atas awan (awan tetap diam)
- kepala mengangguk pelan (sprite kepala terpisah, sumbu putar di leher)
- badan "bernafas" — mengembang-mengempis tipis
- awan ikut mengembang/mengempis saat karakter turun (kesan memantul)
- sesekali tersenyum sendiri saat menganggur (gestur acak tiap 12–26 detik)

**Gestur bubble:**
- **Tap** → maskot senyum 😸 + langsung ke Asisten (chat)
- **Tap & tahan** → ke Pengaturan
- **Drag** → pindahkan; saat dilepas, dia "mendarat" menempel di tepi layar terdekat
- Ekspresi **kaget** 😳 + bubble **memantul** setiap ada pengingat deadline/kelas
- Untuk menyembunyikan: notifikasi "Maskot Saku aktif" → **Sembunyikan**
- Bubble otomatis hidup lagi setelah HP restart (kalau sebelumnya aktif)

## 🎨 Mengganti maskot dengan gambarmu sendiri

Maskot disimpan sebagai sprite PNG **berlatar transparan** di `android/app/src/main/res/drawable-nodpi/`:

| Berkas | Isi |
|---|---|
| `mascot.png` | karakter utuh — ekspresi dasar |
| `mascot_head.png` | potongan **kepala** (dipakai untuk anggukan) |
| `mascot_body.png` | potongan **badan** (dipakai untuk "napas") |
| `mascot_happy.png` | ekspresi senyum (tap & gestur idle) |
| `mascot_alert.png` | ekspresi kaget (pengingat deadline/kelas) |

Aturan tata letak (penting agar animasi tetap rapi — kepala dan badan harus pas saat digerakkan):

- kanvas **424×472 px**, PNG transparan (RGBA)
- isi karakter **352×400 px**, digambar di tengah: mulai **x = 36**, **y = 36**
- sisi luar 36 px di setiap sisi **wajib transparan** — itu ruang untuk animasi (anggukan, napas, pantulan); kalau terisi, gerakan akan terpotong tepi jendela
- `mascot_head`/`mascot_body` = hasil potong `mascot.png` pada pita **y = 64%-84%** dari kanvas

Jendela bubble mengikuti karakter + awan: karakter tingginya **112 dp** (lebarnya ~101 dp), di bawahnya ada **awan** setinggi ~38 dp yang menutupi bagian bawah sprite — jadi kesannya maskot berdiri di atas awan, bukan terbang. Jendela overlay-nya ~136 × 135 dp, **tanpa latar apa pun**. Sentuhan hanya diterima di area karakter dan awan; tap di bagian transparan diteruskan ke aplikasi di bawahnya.

Awan digambar penuh dengan kode di `CloudView.kt` (gabungan gumpalan lingkaran + alas oval, dengan bayangan lembut) — **bukan aset gambar**, jadi tidak ada berkas tambahan yang perlu diurus saat mengganti maskot.

**Animasi:**
- karakter naik-turun (±3 dp) dan bergoyang pelan — **awan tetap di tempat** sebagai jangkar
- awan mengembang/mengempis tipis mengikuti turun-naiknya karakter (kesan memantul)
- kepala mengangguk, badan bernapas, dan sesekali tersenyum sendiri saat menganggur
- bagian bawah sprite (torso) dibuat **memudar** pada 80%–94% tinggi, supaya tidak ada garis potongan rata di sisi awan

Cara termudah: kirim gambarmu (wajah menghadap depan, satu figur) lalu minta aku memprosesnya — pemotongan latar, pembuangan halo putih di tepi, penormalan ukuran, dan pemisahan kepala/badan bisa dilakukan otomatis.

## 🔧 Detail teknis

| Komponen | Keterangan |
|---|---|
| `MainActivity.kt` | WebView layar penuh memuat `file:///android_asset/saku/index.html`; bridge `window.SakuNative`; izin notifikasi |
| `BubbleService.kt` | Foreground service overlay (`SYSTEM_ALERT_WINDOW`); animasi bobbing, drag & snap-to-edge, bounce; aksi "Sembunyikan" |
| `NativeBridge.kt` | JS↔native: izin overlay, toggle bubble, teruskan notifikasi web → notifikasi sistem + pantulan bubble |
| `BootReceiver.kt` | Nyalakan bubble lagi setelah reboot |
| `Notifier.kt` | Notifikasi sistem Android dari pengingat web |
| Build | AGP 8.5.2 · Kotlin 1.9.24 · Gradle 8.7 · JDK 17 · minSdk 26 · targetSdk 34 |
| Aset web | Disalin dari root repo saat build (`copyWebAssets`) — **satu sumber kebenaran** |

**Catatan data:** localStorage di WebView terpisah dari browser HP-mu. Pindahkan data dengan **Pengaturan → Data → Ekspor** di browser, lalu **Impor** di aplikasi.

## 💬 Chat AI di dalam aplikasi

Chat AI butuh internet. Supaya tetap jalan meski WebView membatasi permintaan dari halaman `file://`, aplikasi **tidak** memakai `fetch` di dalam WebView:

```
js/ai.js  →  SakuHttp (jembatan native)  →  HttpBridge.kt  →  internet
```

Permintaan dikirim oleh Android sendiri (`HttpURLConnection`) di background thread, lalu hasilnya dikembalikan ke halaman. Jadi chat hanya butuh koneksi internet, tanpa tersangkut batasan origin WebView.

Penyedia bawaan (gratis, tanpa API key) dicoba berurutan dengan beberapa model cadangan:

1. Pollinations `POST /openai` — model: pilihanmu → `openai` → `mistral` → `openai-fast`
2. Pollinations `POST /` (respons teks polos)
3. Pollinations `GET /{prompt}` (cadangan terakhir)

Kalau semuanya ditolak (server gratis kadang membatasi permintaan, mis. HTTP 403), muncul pesan berisi **detail jalur mana yang gagal**. Untuk memastikan: **Pengaturan → Asisten AI → Tes koneksi** — hasilnya menyebut jalur transport (`native`/`fetch`), lama respons, dan rincian tiap percobaan.

**Paling andal: pakai API Kustom milikmu sendiri** (gratis, cepat, dan stabil) di Pengaturan → Asisten AI:

| Penyedia | Base URL | Model |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |

Isi Base URL + API key dari penyedia tersebut, lalu tekan **Tes koneksi**.

## 🧯 Kalau muncul "Halaman web / Webpage not available"

Aplikasi membuka PWA-nya dari aset lokal di dalam APK (`assets/saku/index.html`). Kalau halaman itu tidak ditemukan, yang muncul adalah pesan error WebView.

Sejak versi **1.0.1**, aplikasi menangani ini sendiri:

- halaman dicari otomatis (`saku/index.html`, lalu `index.html`) — jadi salah satu layout tetap jalan;
- kalau benar-benar tidak ada, muncul **halaman diagnosa** berisi versi aplikasi, URL yang dicoba, dan **daftar isi `assets/` di dalam APK** — foto layar itu dan kirim, penyebabnya langsung kelihatan;
- pipeline build **menolak merilis APK** yang asetnya tidak lengkap, jadi rilis baru tidak akan pernah dalam keadaan rusak ini.

Yang perlu dicek dulu di HP:

1. **Versi terpasang.** Buka **Pengaturan → Bubble Maskot** (di dalam aplikasi) atau **Setelan HP → Aplikasi → Saku**. Kalau versinya masih `1.0.0`, APK lama masih terpasang — unduh ulang dari rilis terbaru.
2. **Timpa, jangan menumpuk.** Semua APK CI memakai kunci tanda tangan yang sama, jadi cukup install di atas versi lama. Kalau dulu pernah memasang APK dari build paling awal, **uninstall sekali** lalu install yang baru.
3. **Android System WebView.** Pastikan **Android System WebView** dan **Chrome** tidak dinonaktifkan: Setelan → Aplikasi → cari "Android System WebView" → aktifkan/update.

## 🛠️ Build lokal (opsional, kalau punya laptop)

```bash
# butuh JDK 17 + Android SDK
cd android
gradle assembleDebug        # atau buka folder android/ di Android Studio
# hasil: app/build/outputs/apk/debug/app-debug.apk
```
