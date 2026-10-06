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

APK di-build otomatis di cloud setiap ada perubahan kode, lewat GitHub Actions:

1. Buka repo ini di GitHub → tab **Actions**
2. Klik workflow run **"Build Android APK"** yang terbaru (status hijau ✅)
3. Scroll ke bawah → **Artifacts** → unduh **saku-apk**
4. File unduhan berupa ZIP — ekstrak, di dalamnya ada `app-debug.apk`
5. Kirim APK ke HP-mu (atau unduh langsung dari browser HP), lalu buka untuk install
6. Saat ditanya, izinkan **"Install dari sumber tidak dikenal"** (aman — ini aplikasimu sendiri)

> Kamu juga bisa memicu build manual: tab Actions → "Build Android APK" → **Run workflow**.

## 🫧 Mengaktifkan bubble maskot

1. Buka aplikasi Saku → izinkan **notifikasi** saat diminta
2. Masuk ke **Pengaturan → Bubble Maskot**
3. Ketuk **Izinkan overlay** → di pengaturan sistem, aktifkan "Tampil di atas aplikasi lain" untuk Saku
4. Kembali ke aplikasi → nyalakan saklar **Tampilkan bubble maskot**
5. Selesai! Maskot muncul di layar dan tetap ada di atas aplikasi lain

**Gestur bubble:**
- **Tap** → maskot senyum 😸 + langsung ke Asisten (chat)
- **Tap & tahan** → ke Pengaturan
- **Drag** → pindahkan; saat dilepas, dia "mendarat" menempel di tepi layar terdekat
- Ekspresi **kaget** 😳 + bubble **memantul** setiap ada pengingat deadline/kelas
- Untuk menyembunyikan: notifikasi "Maskot Saku aktif" → **Sembunyikan**
- Bubble otomatis hidup lagi setelah HP restart (kalau sebelumnya aktif)

## 🎨 Mengganti maskot dengan gambarmu sendiri

1. Siapkan gambar karakter (makin besar makin bagus; wajah menghadap depan, komposisi tengah)
2. Crop jadi **lingkaran** PNG 512×512 (bisa pakai [online circle crop](https://crop-circle.imageonline.co/) atau minta aku memprosesnya — kirim saja filenya)
3. Ganti file `android/app/src/main/res/drawable-nodpi/mascot.png` dengan gambarmu (nama tetap sama)
4. Commit & push → tunggu build → unduh APK baru

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

**Catatan AI:** chat AI butuh internet, sama seperti versi web. Kalau di dalam aplikasi chat gagal terus (keterbatasan `file://` origin di WebView pada beberapa perangkat), alternatifnya: aktifkan **API Kustom** di Pengaturan → Asisten AI, atau ganti URL muatan di `MainActivity.kt` ke alamat hosting HTTPS (mis. GitHub Pages).

## 🛠️ Build lokal (opsional, kalau punya laptop)

```bash
# butuh JDK 17 + Android SDK
cd android
gradle assembleDebug        # atau buka folder android/ di Android Studio
# hasil: app/build/outputs/apk/debug/app-debug.apk
```
