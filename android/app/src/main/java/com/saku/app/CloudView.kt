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

    /**
     * cx, cy, r (fraksi kotak bentuk) untuk setiap gumpalan.
     *
     * Tata letak ini dipilih lewat uji cakupan: seluruh baris sprite mulai 0,742H ke
     * bawah (pita sambungan kepala/badan + potongan bawah sprite) HARUS tertutup awan
     * di sepanjang lebar karakter — kalau tidak, potongan itu terlihat sebagai karakter
     * yang pudar. Uji: tidak ada satu piksel pun menyembul di luar awan.
     */
    private val puffs = listOf(
        floatArrayOf(0.50f, 0.16f, 0.19f),   // puncak tengah
        floatArrayOf(0.30f, 0.20f, 0.17f),   // puncak kiri
        floatArrayOf(0.70f, 0.20f, 0.17f),   // puncak kanan
        floatArrayOf(0.15f, 0.26f, 0.20f),   // bahu kiri (lebar)
        floatArrayOf(0.85f, 0.26f, 0.20f),   // bahu kanan (lebar)
        floatArrayOf(0.30f, 0.58f, 0.22f),   // perut kiri
        floatArrayOf(0.70f, 0.58f, 0.22f),   // perut kanan
        floatArrayOf(0.50f, 0.62f, 0.26f)    // perut tengah
    )

    /** Alas lebar (cx, cy, rx, ry) — menjamin cakupan penuh di zona potongan. */
    private val baseOval = floatArrayOf(0.50f, 0.36f, 0.52f, 0.30f)

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
        val o = baseOval
        path.addOval(
            x0 + (o[0] - o[2]) * bw, y0 + (o[1] - o[3]) * bh,
            x0 + (o[0] + o[2]) * bw, y0 + (o[1] + o[3]) * bh,
            Path.Direction.CW
        )

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
        canvas.drawOval(x0 - 0.10f * bw, y0 + 0.55f * bh, x1 + 0.10f * bw, y0 + 0.95f * bh, tint)
        tint.color = 0x0F5B6B8C
        canvas.drawOval(x0 - 0.10f * bw, y0 + 0.70f * bh, x1 + 0.10f * bw, y1 + 0.12f * bh, tint)
        canvas.restore()
    }
}
