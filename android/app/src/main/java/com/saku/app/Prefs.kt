package com.saku.app

import android.content.Context

/** Preferensi sederhana untuk status bubble maskot. */
object Prefs {
    private const val FILE = "saku_native"
    private const val KEY_BUBBLE = "bubble_enabled"
    private const val KEY_PENDING = "bubble_pending"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun bubbleEnabled(ctx: Context): Boolean = sp(ctx).getBoolean(KEY_BUBBLE, false)
    fun setBubbleEnabled(ctx: Context, v: Boolean) {
        sp(ctx).edit().putBoolean(KEY_BUBBLE, v).apply()
    }

    fun pendingEnable(ctx: Context): Boolean = sp(ctx).getBoolean(KEY_PENDING, false)
    fun setPendingEnable(ctx: Context, v: Boolean) {
        sp(ctx).edit().putBoolean(KEY_PENDING, v).apply()
    }
}
