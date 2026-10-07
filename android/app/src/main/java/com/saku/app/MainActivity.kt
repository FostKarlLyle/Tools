package com.saku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.IOException

/**
 * Activity utama: WebView layar penuh yang memuat aplikasi web Saku dari aset lokal.
 * Bertugas juga mengurus izin notifikasi (Android 13+) dan menyambungkan bridge native.
 *
 * Halaman utama dicari secara defensif (lihat [entryCandidates]) supaya aplikasi tidak
 * berhenti di halaman "webpage not available" kalau layout aset di dalam APK berubah.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var pendingRoute: String? = null

    /**
     * Kemungkinan lokasi index.html di dalam APK, dicoba berurutan:
     * 1. `saku/index.html` — layout normal (lihat copyWebAssets di app/build.gradle)
     * 2. `index.html`      — layout lama (aset disalin ke root)
     * 3. sisanya           — cadangan kalau struktur folder berubah lagi
     */
    private val entryCandidates = listOf(
        "saku/index.html",
        "index.html",
        "webassets/saku/index.html",
        "webassets/index.html"
    )
    private var nextCandidate = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            textZoom = 100
            // Halaman dimuat dari file:// — izinkan dia membaca aset lokal lain
            // (css/js/ikon) dan memanggil API AI lintas-origin.
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
        }
        webView.webViewClient = object : WebViewClient() {
            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                // tautan http(s) dibuka di browser luar; aset lokal tetap di dalam
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (e: Exception) {
                        // tidak ada browser — biarkan WebView yang membuka
                        return false
                    }
                    return true
                }
                return false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                // hanya peduli pada halaman utama, bukan gambar/script yang gagal
                if (request?.isForMainFrame != true) return
                // halaman ini gagal dimuat → coba lokasi aset berikutnya
                if (!loadNextEntry()) {
                    showDiagnostics(request.url?.toString(), error?.description?.toString())
                }
            }
        }
        webView.addJavascriptInterface(NativeBridge(this), "SakuNative")
        // HTTP lewat native — jalan pintas yang membuat chat AI tetap bisa jalan
        // walau WebView membatasi permintaan dari halaman file://
        webView.addJavascriptInterface(HttpBridge(this), "SakuHttp")

        // route awal (mis. bubble meminta langsung ke chat)
        pendingRoute = intent?.getStringExtra("route")
        if (!loadNextEntry()) {
            showDiagnostics(null, "Halaman index.html tidak ditemukan di dalam APK")
        }

        // izin notifikasi Android 13+
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 41)
            }
        }

        // kalau bubble sebelumnya aktif (mis. setelah update aplikasi), pastikan jalan
        if (Prefs.bubbleEnabled(this) && Settings.canDrawOverlays(this)) {
            BubbleService.start(this)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.getStringExtra("route")?.let { r ->
            if (::webView.isInitialized) {
                webView.post { webView.evaluateJavascript("location.hash='#/$r'", null) }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // lanjutan alur "izinkan overlay dulu" dari bridge
        if (Prefs.pendingEnable(this) && Settings.canDrawOverlays(this)) {
            Prefs.setPendingEnable(this, false)
            Prefs.setBubbleEnabled(this, true)
            BubbleService.start(this)
        }
        // beri tahu web app supaya status izin di Pengaturan ikut segar
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('saku:native-perm-changed'))", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    /* ---------------- pemuatan halaman ---------------- */

    /**
     * Muat kandidat halaman berikutnya yang benar-benar ada di dalam APK.
     * @return true kalau ada yang dimuat, false kalau semua kandidat habis.
     */
    private fun loadNextEntry(): Boolean {
        while (nextCandidate < entryCandidates.size) {
            val path = entryCandidates[nextCandidate]
            nextCandidate++
            if (assetExists(path)) {
                val base = "file:///android_asset/$path"
                val route = pendingRoute
                webView.loadUrl(if (route.isNullOrEmpty()) base else "$base#/$route")
                return true
            }
        }
        return false
    }

    /** Jalankan JavaScript di WebView (dipakai jembatan native, mis. HttpBridge). */
    fun evalJs(js: String) {
        runOnUiThread {
            if (::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    /** Ulangi pencarian dari kandidat pertama (dipakai tombol "Coba lagi" di halaman diagnosa). */
    fun retryLoad() {
        nextCandidate = 0
        if (!loadNextEntry()) {
            showDiagnostics(null, "Halaman index.html tidak ditemukan di dalam APK")
        }
    }

    private fun assetExists(path: String): Boolean = try {
        assets.open(path).close()
        true
    } catch (e: IOException) {
        false
    }

    /** Versi aplikasi (versionName) — dipakai halaman diagnosa & bridge native. */
    @Suppress("DEPRECATION")
    fun appVersion(): String {
        return try {
            val info = if (Build.VERSION.SDK_INT >= 33) {
                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                packageManager.getPackageInfo(packageName, 0)
            }
            info?.versionName ?: "-"
        } catch (e: Exception) {
            "-"
        }
    }

    private fun showDiagnostics(failedUrl: String?, error: String?) {
        if (!::webView.isInitialized) return
        webView.loadDataWithBaseURL(
            null,
            diagnosticPage(failedUrl, error),
            "text/html",
            "UTF-8",
            null
        )
    }

    /** Daftar isi folder assets/ di dalam APK (2 level) — untuk memastikan aset benar-benar terpaket. */
    private fun assetTree(): String {
        val sb = StringBuilder()
        fun walk(path: String, depth: Int) {
            if (depth > 2) return
            val children: Array<String> = try {
                assets.list(path) ?: emptyArray()
            } catch (e: IOException) {
                emptyArray()
            }
            for (name in children.sorted()) {
                val child = if (path.isEmpty()) name else "$path/$name"
                val grand: Array<String> = try {
                    assets.list(child) ?: emptyArray()
                } catch (e: IOException) {
                    emptyArray()
                }
                sb.append("  ".repeat(depth)).append(child).append(if (grand.isEmpty()) "" else "/").append('\n')
                if (grand.isNotEmpty()) walk(child, depth + 1)
            }
        }
        walk("", 0)
        return if (sb.isEmpty()) "(folder assets kosong)" else sb.toString()
    }

    /**
     * Halaman HTML mandiri (tanpa aset luar) yang muncul kalau halaman utama benar-benar
     * tidak bisa dibuka. Menampilkan versi aplikasi + isi assets/ supaya masalahnya bisa
     * dilaporkan dengan jelas (atau cukup difoto).
     */
    private fun diagnosticPage(failedUrl: String?, error: String?): String {
        val v = esc(appVersion())
        val u = esc(failedUrl ?: "-")
        val e = esc(error ?: "-")
        val tree = esc(assetTree())
        return """
            |<!DOCTYPE html>
            |<html lang="id"><head><meta charset="utf-8">
            |<meta name="viewport" content="width=device-width,initial-scale=1">
            |<title>Saku — diagnosa</title>
            |<style>
            | body{font-family:system-ui,-apple-system,sans-serif;padding:20px;line-height:1.55;color:#1f2430;background:#f6f7f9}
            | h2{margin:0 0 8px;font-size:19px}
            | p{margin:6px 0}
            | .tag{color:#6b7280;font-size:13px}
            | pre{background:#fff;border:1px solid #e3e5ee;border-radius:10px;padding:12px;overflow:auto;font-size:12px}
            | button{margin-top:18px;padding:12px 18px;border-radius:10px;border:0;background:#4F46E5;color:#fff;font-size:15px}
            |</style></head><body>
            |<h2>Halaman lokal Saku gagal dibuka</h2>
            |<p class="tag">Versi aplikasi: <b>v$v</b></p>
            |<p class="tag">URL yang dicoba: <b>$u</b></p>
            |<p class="tag">Pesan error: <b>$e</b></p>
            |<p class="tag">Isi <code>assets/</code> di dalam APK:</p>
            |<pre>$tree</pre>
            |<button onclick="SakuNative.retryLoad()">Coba lagi</button>
            |</body></html>
        """.trimMargin()
    }

    private fun esc(s: String): String = s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
}
