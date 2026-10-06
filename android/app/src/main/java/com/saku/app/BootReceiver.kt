package com.saku.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/** Hidupkan kembali bubble maskot setelah HP restart (kalau sebelumnya aktif). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            if (Prefs.bubbleEnabled(context) && Settings.canDrawOverlays(context)) {
                BubbleService.start(context)
            }
        }
    }
}
