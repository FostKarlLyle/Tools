package com.saku.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import kotlin.math.max

/**
 * Kelopak mata maskot, digambar dengan kode (tanpa aset gambar) sehingga kedipannya
 * mulus dan bisa diatur penuh dari animasi.
 *
 * Geometri kotak mata diambil dari pengukuran iris pada sprite `mascot_head.png`
 * (kanvas 424x472) — karena view ini dipasang di wadah yang sama dengan sprite kepala,
 * fraksinya langsung cocok:
 *   mata kiri  : pusat (187,0 , 250,5) px
 *   mata kanan : pusat (271,5 , 241,0) px
 *   kotak mata : ±25 px horizontal, ±23 px vertikal (menutupi iris + garis mata)
 *
 * Cara kerja tiap mata:
 * - kelopak atas: persegi membulat dari tepi atas kotak ke `uY` (turun mengikuti [closure])
 * - saat hampir menutup, sisa bagian bawah mata juga ditutup warna kulit, sehingga
 *   pada [closure] = 1 yang terlihat hanya garis mata di tengah (seperti mata terpejam)
 * - garis mata (lash) digambar di tepi bawah kelopak, melengkung sedikit ke bawah
 */
class EyeLidView(context: Context) : View(context) {

    companion object {
        // pusat mata sebagai fraksi lebar/tinggi sprite kepala
        private val EYE_CX = floatArrayOf(0.4410f, 0.6403f)
        private val EYE_CY = floatArrayOf(0.5307f, 0.5106f)
        private const val EYE_HW = 0.0590f   // setengah lebar kotak mata
        private const val EYE_HH = 0.0487f   // setengah tinggi kotak mata

        private const val SKIN_TOP = 0xFFE9D1C4.toInt()
        private const val SKIN_BOT = 0xFFFBE4D6.toInt()
        private const val LASH = 0xFF1C1416.toInt()
    }

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lash = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        color = LASH
    }
    private val patch = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val path = Path()
    private val rect = RectF()

    /** 0 = mata terbuka, 1 = mata terpejam. */
    var closure = 0f
        set(v) {
            field = v.coerceIn(0f, 1f)
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        if (closure <= 0.01f) return
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val hw = EYE_HW * w
        val hh = EYE_HH * h
        val sw = max(1.8f, hh * 0.16f)

        for (i in EYE_CX.indices) {
            val cx = EYE_CX[i] * w
            val cy = EYE_CY[i] * h
            val top = cy - hh
            val bottom = cy + hh
            // tepi bawah kelopak: dari tepi atas mata (terbuka) menuju tengah mata (terpejam)
            val uY = top + (cy - top) * closure

            // 1) kelopak atas (opaque)
            rect.set(cx - hw, top - sw, cx + hw, uY)
            val r = max(2f, hh * 0.45f)
            fill.shader = LinearGradient(
                0f, top - sw, 0f, uY,
                SKIN_TOP, SKIN_BOT, Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(rect, r, r, fill)
            fill.shader = null

            // 2) sisa mata bagian bawah ikut ditutup saat hampir terpejam
            if (closure > 0.7f) {
                val a = ((closure - 0.7f) / 0.3f).coerceIn(0f, 1f)
                patch.color = SKIN_BOT
                patch.alpha = (255 * a).toInt()
                rect.set(cx - hw, uY, cx + hw, bottom + sw * 0.5f)
                canvas.drawRoundRect(rect, r, r, patch)
                patch.alpha = 255
            }

            // 3) garis mata di tepi bawah kelopak (melengkung halus)
            lash.strokeWidth = sw
            path.reset()
            path.moveTo(cx - hw + sw * 0.4f, uY - sw * 0.2f)
            path.quadTo(cx, uY + hh * 0.16f * closure, cx + hw - sw * 0.4f, uY - sw * 0.2f)
            canvas.drawPath(path, lash)
        }
    }
}
