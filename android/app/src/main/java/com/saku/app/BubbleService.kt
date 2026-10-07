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
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
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

        /** Ukuran bubble di layar (dp). 150dp ≈ 3,5 cm di HP biasa. */
        private const val TARGET_DP = 150f
        /** Ukuran gambar karakter di dalam bubble (dp) — ruang sisanya untuk cincin. */
        private const val CONTENT_DP = 140f
        /** Celah transparan di sekeliling karakter supaya cincin putih tidak menempel. */
        private const val PAD_DP = 6f

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
    private val rnd = Random.Default

    private var dragging = false
    private var baseY = 0
    private var sizePx = 0
    private var pivotsReady = false

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
        restoreJob?.let { handler.removeCallbacks(it) }
        idleJob?.let { handler.removeCallbacks(it) }
        bubble?.let {
            try { wm.removeView(it) } catch (e: Exception) { /* sudah lepas */ }
        }
        bubble = null
        bodyImg = null
        headImg = null
        pulseReceiver?.let {
            try { unregisterReceiver(it) } catch (e: Exception) { /* belum terdaftar */ }
        }
        super.onDestroy()
    }

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

    /* ---------------- overlay bubble ---------------- */

    @SuppressLint("ClickableViewAccessibility")
    private fun addBubble() {
        sizePx = dp(TARGET_DP)
        val dm = resources.displayMetrics

        val frame = FrameLayout(this)

        // badan di bawah, kepala di atas — keduanya sprite 512x512 dengan tata letak sama,
        // jadi bisa digerakkan sendiri-sendiri tanpa terlihat "jahitan" di leher.
        val body = ImageView(this)
        body.setImageResource(R.drawable.mascot_body)
        body.scaleType = ImageView.ScaleType.FIT_CENTER
        frame.addView(body, FrameLayout.LayoutParams(-1, -1))
        bodyImg = body

        val head = ImageView(this)
        head.setImageResource(R.drawable.mascot_head)
        head.scaleType = ImageView.ScaleType.FIT_CENTER
        frame.addView(head, FrameLayout.LayoutParams(-1, -1))
        headImg = head

        // cincin oval putih di belakang maskot
        val pad = dp(PAD_DP)
        frame.setPadding(pad, pad, pad, pad)
        val ring = GradientDrawable()
        ring.shape = GradientDrawable.OVAL
        ring.setColor(0xFFFFFFFF.toInt())
        ring.setStroke(dp(1.5f), 0xFF4F46E5.toInt())
        frame.background = ring
        frame.clipToPadding = false

        val p = WindowManager.LayoutParams(
            sizePx, sizePx,
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
        val ampY = dp(4f).toFloat()          // naik-turun seluruh bubble
        val ampRot = 1.7f                    // goyang seluruh bubble (derajat)
        val headNod = dp(2.6f).toFloat()     // anggukan kepala
        val breath = 0.018f                  // "napas" badan

        bobAnim = ValueAnimator.ofFloat(0f, (Math.PI * 2).toFloat()).apply {
            duration = 2600
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener { anim ->
                val t = (anim.animatedValue as Float).toDouble()
                setupPivotsOnce()
                if (!dragging) {
                    val offset = (sin(t) * ampY).toInt()
                    lp?.let { params ->
                        params.y = baseY + offset
                        bubble?.let { b ->
                            b.rotation = (sin(t + 1.1) * ampRot).toFloat()
                            try { wm.updateViewLayout(b, params) } catch (e: Exception) { }
                        }
                    }
                    // kepala mengangguk dengan fase sedikit berbeda dari badan
                    headImg?.let { h ->
                        h.translationY = (sin(t + 0.8) * headNod - headNod * 0.4).toFloat()
                        h.rotation = (sin(t + 1.9) * 1.6).toFloat()
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
        val head = headImg ?: return
        val body = bodyImg ?: return
        if (head.width <= 0 || body.width <= 0) return
        head.pivotX = head.width * 0.5f
        head.pivotY = head.height * 0.45f
        body.pivotX = body.width / 2f
        body.pivotY = body.height.toFloat()
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
                    land(v)
                }
            })
            start()
        }
    }

    private fun land(v: View) {
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            addUpdateListener { a ->
                val t = a.animatedValue as Float
                val s = sin((t * Math.PI).toDouble()).toFloat()
                v.scaleX = 1f + s * 0.12f
                v.scaleY = 1f - s * 0.10f
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
        val v = bubble ?: return
        val strength = if (soft) 0.10f else 0.22f
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
