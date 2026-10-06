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
import android.os.IBinder
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

/**
 * Bubble maskot anime yang melayang di atas aplikasi lain.
 * - melayang halus naik-turun (bobbing) + goyang kecil
 * - bisa di-drag; saat dilepas menempel ke tepi layar terdekat dengan efek "mendarat"
 * - tap          → buka Asisten Saku
 * - tap & tahan  → buka Pengaturan
 * - memantul (bounce) setiap ada notifikasi pengingat
 */
class BubbleService : Service() {

    companion object {
        const val ACTION_PULSE = "com.saku.app.PULSE"
        private const val ACTION_STOP = "com.saku.app.STOP"
        private const val CHANNEL = "bubble"
        private const val NOTIF_ID = 7

        fun start(ctx: Context) {
            val i = Intent(ctx, BubbleService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, BubbleService::class.java))
        }

        /** Minta bubble memantul (dipanggil saat ada notifikasi pengingat). */
        fun pulse(ctx: Context) {
            val i = Intent(ACTION_PULSE)
            i.setPackage(ctx.packageName)
            ctx.sendBroadcast(i)
        }
    }

    private lateinit var wm: WindowManager
    private var bubble: FrameLayout? = null
    private var lp: WindowManager.LayoutParams? = null
    private var bobAnim: ValueAnimator? = null
    private var pulseReceiver: BroadcastReceiver? = null

    private var dragging = false
    private var baseY = 0
    private var sizePx = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        createChannel()
        startForeground(NOTIF_ID, buildNotif())
        addBubble()

        pulseReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
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
        bubble?.let {
            try { wm.removeView(it) } catch (e: Exception) { /* sudah lepas */ }
        }
        bubble = null
        pulseReceiver?.let {
            try { unregisterReceiver(it) } catch (e: Exception) { /* belum terdaftar */ }
        }
        super.onDestroy()
    }

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

    /* ---------------- overlay bubble ---------------- */

    @SuppressLint("ClickableViewAccessibility")
    private fun addBubble() {
        sizePx = dp(118f)
        val dm = resources.displayMetrics

        val frame = FrameLayout(this)
        val img = ImageView(this)
        img.setImageResource(R.drawable.mascot)
        img.scaleType = ImageView.ScaleType.CENTER_CROP
        frame.addView(img, FrameLayout.LayoutParams(-1, -1))

        // cincin oval di belakang maskot (maskot.png sudah berbentuk lingkaran transparan)
        val pad = dp(2f)
        frame.setPadding(pad, pad, pad, pad)
        val ring = GradientDrawable()
        ring.shape = GradientDrawable.OVAL
        ring.setColor(0xFFFFFFFF.toInt())
        ring.setStroke(dp(1.5f), 0xFF4F46E5.toInt())
        frame.background = ring

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
                        !moved -> openApp("asisten")
                        else -> snapToEdge(v)
                    }
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

    /* ---------------- animasi ---------------- */

    /** Melayang halus: naik-turun sinus + goyang rotasi kecil. */
    private fun startBobbing() {
        val amplitude = dp(4f).toFloat()
        bobAnim = ValueAnimator.ofFloat(0f, (Math.PI * 2).toFloat()).apply {
            duration = 2300
            repeatCount = ValueAnimator.INFINITE
            addUpdateListener { anim ->
                if (!dragging) {
                    val t = anim.animatedValue as Float
                    val offset = (sin(t.toDouble()) * amplitude).toInt()
                    lp?.let { params ->
                        params.y = baseY + offset
                        bubble?.let { b ->
                            b.rotation = (sin(t.toDouble() + 1.2) * 2.5).toFloat()
                            try { wm.updateViewLayout(b, params) } catch (e: Exception) { }
                        }
                    }
                }
            }
            start()
        }
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
                v.scaleX = 1f + s * 0.14f
                v.scaleY = 1f - s * 0.12f
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

    /** Pantulan gembira saat ada notifikasi. */
    private fun bounce() {
        val v = bubble ?: return
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 600
            addUpdateListener { a ->
                val t = a.animatedValue as Float
                val s = sin((t * Math.PI * 2).toDouble()).toFloat() * (1f - t)
                v.scaleX = 1f + s * 0.22f
                v.scaleY = 1f + s * 0.22f
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
