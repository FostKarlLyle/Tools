package com.saku.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View

/**
 * Awan kecil di bawah maskot — supaya kesannya karakter berdiri di atas awan,
 * bukan sekadar melayang di udara.
 *
 * Digambar penuh dengan kode (tanpa aset gambar) sebagai gabungan beberapa lingkaran
 * yang menyatu, lalu diberi bayangan lembut dan peneduh di bagian bawah supaya terasa
 * bervolume. Bagian bawah awan menutupi potongan bawah sprite maskot.
 *
 * Tata letak: bentuk awan tidak digambar sampai tepi view. Di dalam view ada "kotak
 * bentuk" (lihat [BOX_LEFT] dst) dan sisa ruang di sekelilingnya dipakai untuk bayangan
 * lembut — kalau bentuknya menyentuh tepi view, bayangannya terpotong oleh bounds view.
 */
class CloudView(context: Context) : View(context) {

    companion object {
        // kotak bentuk relatif terhadap view (kiri, kanan, atas, bawah)
        private const val BOX_LEFT = 0.06f
        private const val BOX_RIGHT = 0.06f
        private const val BOX_TOP = 0.03f
        private const val BOX_BOTTOM = 0.14f
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val tint = Paint(Paint.ANTI_ALIAS_FLAG)

    /** cx, cy, r (fraksi kotak bentuk) untuk setiap gumpalan. */
    private val puffs = listOf(
        floatArrayOf(0.50f, 0.42f, 0.34f),   // gumpalan utama di tengah
        floatArrayOf(0.25f, 0.52f, 0.25f),   // kiri
        floatArrayOf(0.75f, 0.52f, 0.25f),   // kanan
        floatArrayOf(0.07f, 0.62f, 0.15f),   // ujung kiri
        floatArrayOf(0.93f, 0.62f, 0.15f)    // ujung kanan
    )

    init {
        // bayangan lembut butuh render software (khusus view kecil ini)
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        // kotak bentuk di dalam view
        val x0 = BOX_LEFT * w
        val x1 = w - BOX_RIGHT * w
        val y0 = BOX_TOP * h
        val y1 = h - BOX_BOTTOM * h
        val bw = x1 - x0
        val bh = y1 - y0
        if (bw <= 0f || bh <= 0f) return

        val path = Path()
        for (p in puffs) {
            path.addCircle(x0 + p[0] * bw, y0 + p[1] * bh, p[2] * bh, Path.Direction.CW)
        }
        // alas lebar: bahu awan harus lebih tinggi daripada potongan bawah karakter,
        // jadi bagian bawah maskot selalu tertutup rapat di sepanjang lebarnya
        path.addOval(x0 + 0.02f * bw, y0 + 0.28f * bh, x0 + 0.98f * bw, y0 + 0.80f * bh, Path.Direction.CW)

        // awan putih + bayangan lembut ke bawah (masih di dalam batas view)
        paint.style = Paint.Style.FILL
        paint.color = 0xFFFFFFFF.toInt()
        paint.setShadowLayer(0.07f * bh, 0f, 0.04f * bh, 0x304A5568)
        canvas.drawPath(path, paint)
        paint.clearShadowLayer()

        // peneduh bagian bawah (kesan bervolume), dibatasi di dalam bentuk awan
        canvas.save()
        canvas.clipPath(path)
        tint.style = Paint.Style.FILL
        tint.color = 0x145B6B8C
        canvas.drawOval(x0 - 0.10f * bw, y0 + 0.58f * bh, x1 + 0.10f * bw, y0 + 0.98f * bh, tint)
        tint.color = 0x0F5B6B8C
        canvas.drawOval(x0 - 0.10f * bw, y0 + 0.72f * bh, x1 + 0.10f * bw, y1 + 0.12f * bh, tint)
        canvas.restore()
    }
}
