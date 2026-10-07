package com.saku.app

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

/**
 * Bubble maskot anime yang melayang di atas aplikasi lain.
 *
 * Animasi (semuanya berjalan sendiri, tanpa perlu ditap):
 * - seluruh bubble melayang naik-turun + goyang kecil (bobbing)
 * - kepala mengangguk halus (sprite kepala terpisah, pivot di leher)
 * - badan "bernafas" (skala vertikal kecil, pivot di kaki)
 * - sesekali tersenyum sendiri saat menganggur (gestur idle acak)
 *
 * Gestur:
 * - tap          → senyum + buka Asisten Saku (chat)
 * - tap & tahan  → buka Pengaturan
 * - drag         → geser; dilepas menempel ke tepi layar terdekat
 * - notifikasi   → ekspresi kaget + bubble memantul
 */
class BubbleService : Service() {

    companion object {
        const val ACTION_PULSE = "com.saku.app.PULSE"
        private const val ACTION_STOP = "com.saku.app.STOP"
        private const val CHANNEL = "bubble"
        private const val NOTIF_ID = 7

        /** Tinggi karakter di layar (dp) — jendela bubble mengikuti ukuran ini. */
        private const val CHAR_H_DP = 112f
        /**
         * Geometri sprite: kanvas 424x472 dengan isi karakter 352x400.
         * Sisa 36 px di setiap sisi = ruang transparan untuk animasi (anggukan, napas,
         * pantulan) supaya gerakan tidak terpotong tepi jendela.
         */
        private const val SPRITE_W = 424f
        private const val SPRITE_H = 472f
        private const val CHAR_W = 352f
        private const val CHAR_H = 400f
        /** Awan di bawah maskot (fraksi terhadap tinggi/lebar karakter). */
        private const val CLOUD_H_RATIO = 0.50f
        private const val CLOUD_W_RATIO = 1.15f
        /**
         * Posisi atas view awan terhadap tinggi karakter. Awan dinaikkan sedikit supaya
         * menutup PENUH pita sambungan kepala/badan dan potongan bawah sprite (sudah
         * diverifikasi: tidak ada satu baris pun tubuh yang menyembul keluar awan).
         */
        private const val CLOUD_TOP_RATIO = 0.70f

        /** Interval frame animasi (~30 fps: tetap halus, lebih hemat baterai). */
        private const val FRAME_MS = 33L
        /** Profil kedipan (detik): turun cepat, tahan sebentar, buka lebih lambat. */
        private const val BLINK_DOWN = 0.07
        private const val BLINK_HOLD = 0.05
        private const val BLINK_UP = 0.14

        fun start(ctx: Context) {
            val i = Intent(ctx, BubbleService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, BubbleService::class.java))
        }

        /** Minta bubble memantul + ekspresi kaget (dipanggil saat ada notifikasi pengingat). */
        fun pulse(ctx: Context) {
            val i = Intent(ACTION_PULSE)
            i.setPackage(ctx.packageName)
            ctx.sendBroadcast(i)
        }
    }

    private lateinit var wm: WindowManager
    private var bubble: FrameLayout? = null
    private var bodyImg: ImageView? = null
    private var headImg: ImageView? = null
    private var lp: WindowManager.LayoutParams? = null
    private var pulseReceiver: BroadcastReceiver? = null
    private var screenReceiver: BroadcastReceiver? = null

    private val handler = Handler(Looper.getMainLooper())
    private var restoreJob: Runnable? = null
    private val rnd = Random.Default

    // --- mesin animasi (loop sendiri; lihat frameRunnable) ---
    private var framesRunning = false
    private var animT = 0.0
    private var nextBlinkAt = 1.2
    private var blinkT0 = -10.0
    private var doubleBlinkAt = -1.0
    private var nextIdleAt = 9.0
    private var bounceT0 = -10.0
    private var bounceDur = 0.6
    private var bounceAmp = 0.14f
    private var landT0 = -10.0
    private var landDur = 0.3
    private var landAmp = 0.10f
    private var popT0 = -10.0
    private var popDur = 0.24

    private var dragging = false
    private var baseY = 0
    private var sizePx = 0
    private var pivotsReady = false
    private var moverView: View? = null
    private var cloudView: CloudView? = null
    private var lidView: EyeLidView? = null
    /** wadah kepala + kelopak mata — animasi kepala dikenakan ke sini, bukan ke gambarnya */
    private var headGroup: View? = null
    private var hitMask: BooleanArray? = null
    private var hitCols = 0
    private var hitRows = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        createChannel()
        startForeground(NOTIF_ID, buildNotif())
        addBubble()

        pulseReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                react(R.drawable.mascot_alert, 3500)
                bounce()
            }
        }
        val filter = IntentFilter(ACTION_PULSE)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(pulseReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(pulseReceiver, filter)
        }
        // layar mati → hentikan animasi (hemat baterai); layar hidup → lanjutkan
        screenReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_OFF -> stopFrames()
                    Intent.ACTION_SCREEN_ON -> startFrames()
                }
            }
        }
        val screenFilter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, screenFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(screenReceiver, screenFilter)
        }
        startFrames()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Prefs.setBubbleEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        // jaring pengaman: apa pun yang membuat loop berhenti, hidupkan lagi di sini
        if (!framesRunning) startFrames()
        return START_STICKY
    }

    override fun onDestroy() {
        stopFrames()
        restoreJob?.let { handler.removeCallbacks(it) }
        bubble?.let {
            try { wm.removeView(it) } catch (e: Exception) { /* sudah lepas */ }
        }
        bubble = null
        bodyImg = null
        headImg = null
        moverView = null
        cloudView = null
        lidView = null
        headGroup = null
        pulseReceiver?.let {
            try { unregisterReceiver(it) } catch (e: Exception) { /* belum terdaftar */ }
        }
        screenReceiver?.let {
            try { unregisterReceiver(it) } catch (e: Exception) { /* belum terdaftar */ }
        }
        super.onDestroy()
    }

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

    /* ---------------- overlay bubble ---------------- */

    @SuppressLint("ClickableViewAccessibility")
    private fun addBubble() {
        // --- ukuran: karakter kecil + awan di bawahnya (jendela mengikuti keduanya) ---
        val charW = dp(CHAR_H_DP * SPRITE_W / CHAR_H)
        val charH = dp(CHAR_H_DP)
        val cloudW = (charW * CLOUD_W_RATIO).toInt()
        val cloudH = (charH * CLOUD_H_RATIO).toInt()
        val cloudTop = (charH * CLOUD_TOP_RATIO).toInt()
        val winW = maxOf(charW, cloudW)
        val winH = cloudTop + cloudH + dp(2f)
        sizePx = winW
        val dm = resources.displayMetrics

        // Root jendela: transparan penuh, tanpa latar. Sentuhan di area transparan
        // dilewatkan ke aplikasi di bawahnya.
        val frame = object : FrameLayout(this) {
            override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
                if (ev.actionMasked == MotionEvent.ACTION_DOWN && !hitsCharacter(ev.x, ev.y)) return false
                return super.dispatchTouchEvent(ev)
            }
        }

        // Wadah karakter: animasi (bobbing, goyang, pantulan) dikenakan ke sini — bukan ke
        // jendela — supaya awan tetap jadi jangkar dan gambar tidak terpotong tepi permukaan.
        val mover = FrameLayout(this)
        val moverLp = FrameLayout.LayoutParams(charW, charH)
        moverLp.leftMargin = (winW - charW) / 2
        moverLp.topMargin = 0
        frame.addView(mover, moverLp)
        moverView = mover

        // badan di bawah, kepala di atas — keduanya sprite dengan tata letak sama,
        // jadi bisa digerakkan sendiri-sendiri tanpa terlihat "jahitan" di leher.
        val body = ImageView(this)
        body.setImageResource(R.drawable.mascot_body)
        body.scaleType = ImageView.ScaleType.FIT_CENTER
        mover.addView(body, FrameLayout.LayoutParams(-1, -1))
        bodyImg = body

        // kepala + kelopak mata dalam satu wadah: semua gerakan kepala (angguk, goyang,
        // geser) dikenakan ke wadah ini supaya kelopak selalu tepat di atas mata.
        val group = FrameLayout(this)
        mover.addView(group, FrameLayout.LayoutParams(-1, -1))
        headGroup = group

        val head = ImageView(this)
        head.setImageResource(R.drawable.mascot_head)
        head.scaleType = ImageView.ScaleType.FIT_CENTER
        group.addView(head, FrameLayout.LayoutParams(-1, -1))
        headImg = head

        val lid = EyeLidView(this)
        group.addView(lid, FrameLayout.LayoutParams(-1, -1))
        lidView = lid

        // Awan ditambahkan SETELAH karakter supaya digambar di depan: bagian bawah sprite
        // (potongan rata di torso) tertutup gumpalan awan → karakter tampak berdiri di awan.
        val cloud = CloudView(this)
        val cloudLp = FrameLayout.LayoutParams(cloudW, cloudH)
        cloudLp.leftMargin = (winW - cloudW) / 2
        cloudLp.topMargin = cloudTop
        frame.addView(cloud, cloudLp)
        cloudView = cloud

        val p = WindowManager.LayoutParams(
            winW, winH,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        )
        p.gravity = Gravity.TOP or Gravity.START
        p.x = 0
        p.y = dm.heightPixels / 3
        baseY = p.y

        attachTouch(frame, p)

        wm.addView(frame, p)
        bubble = frame
        lp = p
        startFrames()
    }

    /**
     * Peta kasar area karakter (diambil dari alpha sprite) supaya sentuhan hanya aktif
     * tepat di badan karakter — bukan di kotak transparan di sekelilingnya.
     * Kalau peta gagal dibuat, semua area diterima (perilaku lama).
     */
    private fun buildHitMask() {
        if (hitMask != null) return
        try {
            val bmp = BitmapFactory.decodeResource(resources, R.drawable.mascot) ?: return
            val cols = 30
            val rows = (cols * bmp.height / bmp.width.toFloat()).toInt().coerceAtLeast(1)
            val mask = BooleanArray(cols * rows)
            for (r in 0 until rows) {
                for (c in 0 until cols) {
                    val x = ((c + 0.5f) * bmp.width / cols).toInt().coerceIn(0, bmp.width - 1)
                    val y = ((r + 0.5f) * bmp.height / rows).toInt().coerceIn(0, bmp.height - 1)
                    mask[r * cols + c] = Color.alpha(bmp.getPixel(x, y)) > 24
                }
            }
            bmp.recycle()
            hitMask = mask
            hitCols = cols
            hitRows = rows
        } catch (e: Exception) { /* biarkan null */ }
    }

    private fun hitsCharacter(x: Float, y: Float): Boolean {
        val m = moverView ?: return true
        // area awan (di bawah karakter) juga bagian dari maskot → boleh disentuh
        if (y > m.bottom) return true
        if (hitMask == null) buildHitMask()
        val mask = hitMask ?: return true
        if (m.width <= 0 || m.height <= 0) return true
        val c = ((x - m.left) / m.width * hitCols).toInt()
        val r = (y / m.height * hitRows).toInt()
        // periksa tetangga juga supaya bagian tipis (ekor, telinga) tetap mudah disentuh
        for (dr in -1..1) {
            for (dc in -1..1) {
                val rr = r + dr
                val cc = c + dc
                if (rr in 0 until hitRows && cc in 0 until hitCols && mask[rr * hitCols + cc]) return true
            }
        }
        return false
    }

    private fun attachTouch(frame: FrameLayout, p: WindowManager.LayoutParams) {
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var downTime = 0L
        var moved = false

        frame.setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragging = true
                    moved = false
                    downX = ev.rawX
                    downY = ev.rawY
                    startX = p.x
                    startY = baseY
                    downTime = ev.eventTime
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - downX
                    val dy = ev.rawY - downY
                    if (!moved && (abs(dx) > dp(4f) || abs(dy) > dp(4f))) moved = true
                    if (moved) {
                        p.x = startX + dx.toInt()
                        baseY = startY + dy.toInt()
                        p.y = baseY
                        try { wm.updateViewLayout(frame, p) } catch (e: Exception) { }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    dragging = false
                    val dt = ev.eventTime - downTime
                    when {
                        !moved && dt >= 550 -> {
                            buzz()
                            openApp("pengaturan")
                        }
                        !moved -> {
                            react(R.drawable.mascot_happy, 1600)
                            bounce()
                            openApp("asisten")
                        }
                        else -> snapToEdge(v)
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    dragging = false
                    snapToEdge(v)
                    true
                }
                else -> false
            }
        }
    }

    /* ---------------- ekspresi ---------------- */

    /**
     * Ganti ekspresi maskot sesaat, lalu kembali ke ekspresi default.
     * Sprite happy/alert berisi satu karakter utuh, jadi saat berekspresi kepala
     * menampilkan sprite itu dan badan disembunyikan; setelah selesai keduanya kembali.
     */
    private fun react(resId: Int, durationMs: Long) {
        val head = headImg ?: return
        val body = bodyImg
        restoreJob?.let { handler.removeCallbacks(it) }
        head.setImageResource(resId)
        lidView?.closure = 0f
        body?.visibility = View.INVISIBLE
        popExpression()
        val job = Runnable {
            headImg?.setImageResource(R.drawable.mascot_head)
            bodyImg?.visibility = View.VISIBLE
        }
        restoreJob = job
        handler.postDelayed(job, durationMs)
    }

    /** Sentakan kecil saat ekspresi berganti (dihitung di loop animasi). */
    private fun popExpression() {
        popT0 = animT
        popDur = 0.24
    }

    /* ---------------- mesin animasi (loop sendiri, bukan animator sistem) ---------------- */

    /**
     * Animasi dijalankan oleh loop Handler ~30 fps, bukan ValueAnimator. Alasannya:
     * - tidak ikut mati saat pengguna mematikan animasi (mode hemat daya / opsi
     *   "hapus animasi" membuat skala animator 0 → ValueAnimator melompat ke akhir);
     * - tidak bisa "nyangkut" seperti pause()/resume() kalau gestur drag tidak selesai;
     * - ~30 fps tetap halus untuk gerakan lambat dan lebih hemat baterai dari 60 fps.
     * Semua posisi dihitung dari waktu berjalan (animT), jadi aman dijeda/dilanjutkan.
     */
    private val frameRunnable = object : Runnable {
        override fun run() {
            if (!framesRunning) return
            try {
                applyFrame(animT)
            } catch (e: Exception) {
                // satu frame gagal tidak boleh mematikan service
            }
            animT += FRAME_MS / 1000.0
            if (framesRunning) handler.postDelayed(this, FRAME_MS)
        }
    }

    private fun startFrames() {
        if (framesRunning) return
        framesRunning = true
        handler.postDelayed(frameRunnable, FRAME_MS)
    }

    private fun stopFrames() {
        framesRunning = false
        handler.removeCallbacks(frameRunnable)
    }

    /** Satu frame animasi; t = detik sejak loop mulai berjalan. */
    private fun applyFrame(t: Double) {
        setupPivotsOnce()
        val m = moverView ?: return
        val w2 = 2.0 * Math.PI

        // 1) karakter naik-turun di atas awan + goyang kecil
        val bob = t * w2 / 2.6
        val ampY = dp(3.2f).toDouble()
        m.translationY = (sin(bob) * ampY).toFloat()
        m.rotation = (sin(bob + 1.1) * 1.6).toFloat()

        // 2) awan mengembang-mengempis mengikuti turun-naiknya karakter
        val press = ((sin(bob) + 1.0) / 2.0).toFloat()
        cloudView?.let { c ->
            c.scaleY = 1f - 0.06f * press
            c.scaleX = 1f + 0.045f * press
            c.rotation = (sin(t * w2 / 5.2 + 0.4) * 0.7).toFloat()
        }

        // 3) kepala bergerak berlapis (dua frekuensi berbeda → tidak monoton)
        val headNod = dp(2.2f).toDouble()
        val swayX = dp(1.5f).toDouble()
        val slowY = dp(1.2f).toDouble()
        headGroup?.let { h ->
            h.translationY = (sin(bob + 0.8) * headNod - headNod * 0.4 +
                              sin(t * w2 / 6.0 + 2.1) * slowY).toFloat()
            h.translationX = (sin(t * w2 / 7.0 + 0.5) * swayX).toFloat()
            h.rotation = (sin(bob + 1.9) * 1.6 + sin(t * w2 / 4.9 + 0.7) * 2.2).toFloat()
        }

        // 4) badan bernapas
        bodyImg?.let { bd ->
            val s = (0.5 + 0.5 * sin(bob * 2)).toFloat()
            bd.scaleY = 1f - 0.018f * s
            bd.scaleX = 1f + 0.012f * s
        }

        // 5) efek sesaat: pantulan / mendarat / sentakan ekspresi
        var scale = 1f
        var scaleX = 1f
        var scaleY = 1f
        val b = pulseValue(t, bounceT0, bounceDur)
        if (b != 0f) scale = 1f + bounceAmp * b
        val l = pulseValue(t, landT0, landDur)
        if (l != 0f) {
            scaleX *= 1f + landAmp * 0.9f * l
            scaleY *= 1f - landAmp * 0.8f * l
        }
        m.scaleX = scaleX * scale
        m.scaleY = scaleY * scale
        val settle = settleValue(t, popT0, popDur)
        headGroup?.let { h ->
            h.scaleX = settle
            h.scaleY = settle
        }

        // 6) kedipan mata (turun cepat → tahan → buka lebih lambat)
        lidView?.let { lid ->
            if (bodyImg?.visibility == View.VISIBLE) {
                if (t >= nextBlinkAt) {
                    blinkT0 = t
                    nextBlinkAt = t + 2.5 + rnd.nextDouble() * 4.5
                    // kadang berkedip dua kali seperti orang asli
                    if (rnd.nextFloat() < 0.3f) doubleBlinkAt = t + 0.32
                }
                if (doubleBlinkAt > 0 && t >= doubleBlinkAt) {
                    doubleBlinkAt = -1.0
                    blinkT0 = t
                }
                lid.closure = blinkCurve(t - blinkT0)
            } else {
                lid.closure = 0f
            }
        }

        // 7) sesekali tersenyum sendiri saat menganggur
        if (!dragging && t >= nextIdleAt) {
            nextIdleAt = t + 12.0 + rnd.nextDouble() * 14.0
            react(R.drawable.mascot_happy, 1400)
            bounce(soft = true)
        }
    }

    /** Bentuk 0 → 1 → 0 (pantulan); 0 kalau waktu di luar rentang. */
    private fun pulseValue(t: Double, t0: Double, dur: Double): Float {
        if (t0 < 0) return 0f
        val p = (t - t0) / dur
        return if (p < 0.0 || p > 1.0) 0f else (sin(p * 2.0 * Math.PI) * (1.0 - p)).toFloat()
    }

    /** 0,96 → 1,0 dengan mulus (sentakan saat ekspresi berganti). */
    private fun settleValue(t: Double, t0: Double, dur: Double): Float {
        if (t0 < 0) return 1f
        val p = ((t - t0) / dur).coerceIn(0.0, 1.0)
        val eased = 1.0 - Math.pow(1.0 - p, 3.0)
        return (0.96 + 0.04 * eased).toFloat()
    }

    /** Profil kedipan: 0 = mata terbuka, 1 = terpejam. */
    private fun blinkCurve(dt: Double): Float = when {
        dt < 0 -> 0f
        dt < BLINK_DOWN -> (dt / BLINK_DOWN).toFloat()
        dt < BLINK_DOWN + BLINK_HOLD -> 1f
        dt < BLINK_DOWN + BLINK_HOLD + BLINK_UP ->
            (1.0 - (dt - BLINK_DOWN - BLINK_HOLD) / BLINK_UP).toFloat()
        else -> 0f
    }

    /**
     * Sumbu putar/skala disetel setelah ukuran view diketahui (layout belum jalan saat
     * view baru dipasang): kepala berputar dari leher, badan berskala dari bagian bawah.
     */
    private fun setupPivotsOnce() {
        if (pivotsReady) return
        val head = headGroup ?: return
        val body = bodyImg ?: return
        if (head.width <= 0 || body.width <= 0) return
        head.pivotX = head.width * 0.5f
        head.pivotY = head.height * 0.45f
        body.pivotX = body.width / 2f
        body.pivotY = body.height.toFloat()
        // awan mengembang dari dasarnya (tidak terangkat saat mengempis)
        cloudView?.let { c ->
            c.pivotX = c.width / 2f
            c.pivotY = c.height.toFloat()
        }
        // karakter membesar/mengecil dari kakinya (karena berdiri di atas awan)
        moverView?.let { m ->
            m.pivotX = m.width / 2f
            m.pivotY = m.height.toFloat()
        }
        pivotsReady = true
    }

    /** Menempel ke tepi layar terdekat, lalu efek "mendarat" (sedikit gepeng). */
    private fun snapToEdge(v: View) {
        val params = lp ?: return
        val screenW = resources.displayMetrics.widthPixels
        val targetX = if (params.x + sizePx / 2 < screenW / 2) 0 else screenW - sizePx
        ValueAnimator.ofInt(params.x, targetX).apply {
            duration = 240
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { a ->
                params.x = a.animatedValue as Int
                try { wm.updateViewLayout(v, params) } catch (e: Exception) { }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    land()
                }
            })
            start()
        }
    }

    /** Efek "mendarat" setelah digeser (dihitung di loop animasi). */
    private fun land() {
        landT0 = animT
        landDur = 0.3
        landAmp = 0.10f
    }

    /** Pantulan gembira (atau lembut saat gestur idle) — dihitung di loop animasi. */
    private fun bounce(soft: Boolean = false) {
        bounceT0 = animT
        bounceDur = if (soft) 0.42 else 0.6
        bounceAmp = if (soft) 0.08f else 0.14f
    }

    /* ---------------- util ---------------- */

    private fun openApp(route: String) {
        val i = Intent(this, MainActivity::class.java)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        i.putExtra("route", route)
        startActivity(i)
    }

    private fun buzz() {
        try {
            val vb = getSystemService(VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) {
                vb.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") vb.vibrate(30)
            }
        } catch (e: Exception) { /* abaikan */ }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Bubble Saku", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Penanda layanan bubble maskot yang sedang aktif"
                    setShowBadge(false)
                }
            )
        }
    }

    private fun buildNotif(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val stopIntent = Intent(this, BubbleService::class.java).setAction(ACTION_STOP)
        val stop = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        builder
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Maskot Saku aktif")
            .setContentText("Melayang di layar — tap bubble untuk chat")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Sembunyikan", stop).build())
        return builder.build()
    }
}
