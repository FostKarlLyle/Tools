package com.saku.app

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * Jembatan JS ↔ native. Terpasang sebagai window.SakuNative di dalam WebView
 * (lihat Pengaturan di aplikasi web: kartu "Bubble Maskot" hanya muncul di aplikasi native).
 */
class NativeBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun platform(): String = "android-native"

    /** Versi aplikasi Android (versionName) — ditampilkan di Pengaturan supaya jelas APK mana yang terpasang. */
    @JavascriptInterface
    fun appVersion(): String = activity.appVersion()

    /** Coba muat lagi halaman utama (dipakai tombol "Coba lagi" di halaman diagnosa). */
    @JavascriptInterface
    fun retryLoad() {
        activity.runOnUiThread { activity.retryLoad() }
    }

    @JavascriptInterface
    fun isOverlayAllowed(): Boolean = Settings.canDrawOverlays(activity)

    @JavascriptInterface
    fun isBubbleEnabled(): Boolean = Prefs.bubbleEnabled(activity)

    @JavascriptInterface
    fun requestOverlayPermission() {
        activity.runOnUiThread {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + activity.packageName)
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
        }
    }

    @JavascriptInterface
    fun setBubbleEnabled(enabled: Boolean) {
        activity.runOnUiThread {
            if (enabled) {
                if (!Settings.canDrawOverlays(activity)) {
                    // minta izin dulu; MainActivity.onResume akan mengaktifkan setelah izin diberikan
                    Prefs.setPendingEnable(activity, true)
                    requestOverlayPermission()
                    return@runOnUiThread
                }
                Prefs.setBubbleEnabled(activity, true)
                BubbleService.start(activity)
            } else {
                Prefs.setBubbleEnabled(activity, false)
                BubbleService.stop(activity)
            }
        }
    }

    /** Teruskan notifikasi pengingat web → notifikasi sistem Android + pantulan bubble. */
    @JavascriptInterface
    fun notify(title: String?, body: String?) {
        activity.runOnUiThread {
            Notifier.post(activity, title ?: "Saku", body ?: "")
            if (Prefs.bubbleEnabled(activity)) BubbleService.pulse(activity)
        }
    }
}
