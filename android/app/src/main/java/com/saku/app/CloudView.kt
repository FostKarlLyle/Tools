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
 * bervolume. Bagian bawah awan sengaja menutupi potongan rata sprite maskot.
 *
 * Tata letak di dalam view (fraksi tinggi/lebar):
 * - puff (gumpalan) menempati bagian atas (cy 0,44–0,70)
 * - sisa bagian bawah dipakai untuk bayangan lembut, jadi tidak terpotong tepi view
 */
class CloudView(context: Context) : View(context) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val tint = Paint(Paint.ANTI_ALIAS_FLAG)

    /** cx, cy, r (fraksi lebar tinggi) untuk setiap gumpalan. */
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

        val path = Path()
        for (p in puffs) {
            path.addCircle(p[0] * w, p[1] * h, p[2] * h, Path.Direction.CW)
        }
        // alas lebar: bahu awan harus lebih tinggi daripada potongan bawah karakter,
        // jadi bagian bawah maskot selalu tertutup rapat di sepanjang lebarnya
        path.addOval(0.02f * w, 0.28f * h, 0.98f * w, 0.80f * h, Path.Direction.CW)

        // awan + bayangan lembut ke bawah (paint putih dengan shadow layer)
        paint.style = Paint.Style.FILL
        paint.color = 0xFFFFFFFF.toInt()
        paint.setShadowLayer(0.13f * h, 0f, 0.05f * h, 0x304A5568)
        canvas.drawPath(path, paint)
        paint.clearShadowLayer()

        // peneduh bagian bawah (kesan bervolume), dibatasi di dalam bentuk awan
        canvas.save()
        canvas.clipPath(path)
        tint.style = Paint.Style.FILL
        tint.color = 0x145B6B8C
        canvas.drawOval(-0.10f * w, 0.58f * h, 1.10f * w, 0.98f * h, tint)
        tint.color = 0x0F5B6B8C
        canvas.drawOval(-0.10f * w, 0.72f * h, 1.10f * w, 1.12f * h, tint)
        canvas.restore()
    }
}
