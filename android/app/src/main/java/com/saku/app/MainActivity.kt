package com.saku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Activity utama: WebView layar penuh yang memuat aplikasi web Saku dari aset lokal.
 * Bertugas juga mengurus izin notifikasi (Android 13+) dan menyambungkan bridge native.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView

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
        }
        webView.addJavascriptInterface(NativeBridge(this), "SakuNative")

        // route awal (mis. bubble meminta langsung ke chat)
        val route = intent?.getStringExtra("route")
        val base = "file:///android_asset/saku/index.html"
        webView.loadUrl(if (route.isNullOrEmpty()) base else "$base#/$route")

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
}
