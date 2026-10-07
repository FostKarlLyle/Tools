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
import android.view.animation.LinearInterpolator
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
        /** Posisi atas view awan terhadap tinggi karakter. */
        private const val CLOUD_TOP_RATIO = 0.74f

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
    private var bobAnim: ValueAnimator? = null
    private var pulseReceiver: BroadcastReceiver? = null

    private val handler = Handler(Looper.getMainLooper())
    private var restoreJob: Runnable? = null
    private var idleJob: Runnable? = null
    private var blinkJob: Runnable? = null
    private var blinkAnim: ValueAnimator? = null
    private val rnd = Random.Default

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
        scheduleIdle()
        scheduleBlink()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Prefs.setBubbleEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        bobAnim?.cancel()
        bobAnim = null
        blinkAnim?.cancel()
        blinkAnim = null
        restoreJob?.let { handler.removeCallbacks(it) }
        idleJob?.let { handler.removeCallbacks(it) }
        blinkJob?.let { handler.removeCallbacks(it) }
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
        startBobbing()
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
                    bobAnim?.pause()
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
                    bobAnim?.resume()
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
                    scheduleIdle()
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    dragging = false
                    bobAnim?.resume()
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

    /** Sentakan kecil saat ekspresi berganti supaya terasa hidup. */
    private fun popExpression() {
        val head = headImg ?: return
        head.animate().cancel()
        head.scaleX = 0.96f
        head.scaleY = 0.96f
        head.animate().scaleX(1f).scaleY(1f).setDuration(220)
            .setInterpolator(AccelerateDecelerateInterpolator()).start()
    }

    /**
     * Kedipan mata berkala: menutup cepat, tahan sebentar, lalu buka lebih lambat.
     * Interval acak 2,5–7 detik; kadang diikuti kedipan kedua (double blink).
     */
    private fun scheduleBlink() {
        blinkJob?.let { handler.removeCallbacks(it) }
        val delay = 2500L + rnd.nextLong(4500L)
        val job = Runnable {
            blink()
            scheduleBlink()
        }
        blinkJob = job
        handler.postDelayed(job, delay)
    }

    private fun blink() {
        val lid = lidView ?: return
        // jangan berkedip saat ekspresi khusus tampil (mata sudah tertutup di sprite)
        if (bodyImg?.visibility != View.VISIBLE || dragging) return
        blinkAnim?.cancel()
        // 0 → 1 (62 ms) → tahan (25%) → 0 (125 ms)
        blinkAnim = ValueAnimator.ofFloat(0f, 1f, 1f, 0f).apply {
            duration = 250
            addUpdateListener { a -> lid.closure = a.animatedValue as Float }
            start()
        }
        // kadang kedip dua kali seperti orang berkedip alami
        if (rnd.nextFloat() < 0.3f) {
            handler.postDelayed({ blink() }, 300L)
        }
    }

    /** Sesekali tersenyum sendiri saat sedang menganggur (supaya tidak terlihat kaku). */
    private fun scheduleIdle() {
        idleJob?.let { handler.removeCallbacks(it) }
        val delay = 12000L + rnd.nextLong(14000L)   // 12–26 detik
        val job = Runnable {
            if (!dragging && bubble != null) {
                react(R.drawable.mascot_happy, 1400)
                bounce(soft = true)
            }
            scheduleIdle()
        }
        idleJob = job
        handler.postDelayed(job, delay)
    }

    /* ---------------- animasi ---------------- */

    /**
     * Animasi utama: bubble melayang (bobbing) + goyang kecil, kepala mengangguk,
     * badan bernapas. Semua bersumbu sama supaya gerakannya terasa satu tubuh.
     */
    private fun startBobbing() {
        val ampY = dp(3.2f).toFloat()        // naik-turun karakter di atas awan
        val ampRot = 1.6f                    // goyang karakter (derajat)
        val headNod = dp(2.2f).toFloat()     // anggukan kepala
        val breath = 0.018f                  // "napas" badan

        bobAnim = ValueAnimator.ofFloat(0f, (Math.PI * 2).toFloat()).apply {
            duration = 2600
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener { anim ->
                val t = (anim.animatedValue as Float).toDouble()
                setupPivotsOnce()
                if (!dragging) {
                    // Jendela TIDAK bergerak: awan tetap di tempatnya, hanya karakter
                    // yang naik-turun dan bergoyang — kesannya berdiri di atas awan.
                    val offset = (sin(t) * ampY).toFloat()
                    moverView?.let { m ->
                        m.translationY = offset
                        m.rotation = (sin(t + 1.1) * ampRot).toFloat()
                    }
                    // awan mengembang/mengempis mengikuti turun-naiknya karakter
                    cloudView?.let { c ->
                        val press = ((sin(t) + 1.0) / 2.0).toFloat()   // 0..1 saat karakter turun
                        c.scaleY = 1f - 0.06f * press
                        c.scaleX = 1f + 0.045f * press
                        c.rotation = (sin(t * 0.5 + 0.4) * 0.7).toFloat()
                    }
                    // kepala bergerak berlapis: anggukan cepat + goyangan lambat + geser
                    // samping pelan (dua frekuensi berbeda → terasa hidup, tidak monoton)
                    val swayX = dp(1.5f).toFloat()
                    val slowY = dp(1.2f).toFloat()
                    headGroup?.let { h ->
                        h.translationY = (sin(t + 0.8) * headNod - headNod * 0.4 +
                                          sin(t * 0.43 + 2.1) * slowY).toFloat()
                        h.translationX = (sin(t * 0.37 + 0.5) * swayX).toFloat()
                        h.rotation = (sin(t + 1.9) * 1.6 + sin(t * 0.53 + 0.7) * 2.2).toFloat()
                    }
                    // badan bernapas (dua kali lebih cepat dari bobbing)
                    bodyImg?.let { bd ->
                        val s = (0.5 + 0.5 * sin(2 * t))
                        bd.scaleY = (1f - breath * s).toFloat()
                        bd.scaleX = (1f + 0.012f * s).toFloat()
                    }
                }
            }
            start()
        }
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

    /** Efek "mendarat" — dikenakan ke wadah karakter (bukan jendela) supaya tidak terpotong. */
    private fun land() {
        val v = moverView ?: return
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            addUpdateListener { a ->
                val t = a.animatedValue as Float
                val s = sin((t * Math.PI).toDouble()).toFloat()
                v.scaleX = 1f + s * 0.10f
                v.scaleY = 1f - s * 0.08f
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    v.scaleX = 1f
                    v.scaleY = 1f
                }
            })
            start()
        }
    }

    /** Pantulan gembira (atau lembut untuk gestur idle) saat ada notifikasi. */
    private fun bounce(soft: Boolean = false) {
        val v = moverView ?: return
        val strength = if (soft) 0.08f else 0.14f
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (soft) 420 else 600
            addUpdateListener { a ->
                val t = a.animatedValue as Float
                val s = sin((t * Math.PI * 2).toDouble()).toFloat() * (1f - t)
                v.scaleX = 1f + s * strength
                v.scaleY = 1f + s * strength
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    v.scaleX = 1f
                    v.scaleY = 1f
                }
            })
            start()
        }
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
