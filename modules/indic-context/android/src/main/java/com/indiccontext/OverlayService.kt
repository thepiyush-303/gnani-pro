package com.indiccontext

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

/**
 * OverlayService — Phase 2
 *
 * Anti-flicker design:
 * - Overlay is shown ONLY when ChatAccessibilityService calls showOverlay().
 * - Position updates are debounced: small movements (< THRESHOLD) are ignored;
 *   valid moves are coalesced into at most one WindowManager call per 60ms.
 * - hideOverlay() is idempotent and cancels any pending position update.
 * - All WindowManager calls happen on the main thread via mainHandler.post {}.
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var currentParams: WindowManager.LayoutParams? = null
    private var isOverlayShowing = false
    private val mainHandler = Handler(Looper.getMainLooper())

    // Position debounce
    private var lastTargetY = -1
    private val POSITION_THRESHOLD_PX = 10  // ignore moves smaller than 10px
    private val POSITION_DEBOUNCE_MS = 60L  // max one layout update per 60ms
    private var pendingPositionUpdate: Runnable? = null

    // Badge counter driven by ChatAccessibilityService
    var contextMessageCount: Int = 0
        set(value) {
            field = value
            mainHandler.post { updateBadge(value) }
        }

    companion object {
        private const val TAG = "OverlayService"
        private const val NOTIF_CHANNEL_ID = "indic_copilot_channel"
        private const val NOTIF_ID = 1001
        const val ACTION_STOP = "com.indiccontext.ACTION_STOP_OVERLAY"

        @Volatile
        var instance: OverlayService? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        Log.i(TAG, "Created.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIF_ID, buildNotification())
        // DO NOT call showOverlay() here — ChatAccessibilityService drives visibility
        Log.i(TAG, "Started. Waiting for input focus trigger.")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        hideOverlay()
        instance = null
        Log.i(TAG, "Destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ───────────────────────────────────────────────────────────────
    // Overlay show / hide
    // ───────────────────────────────────────────────────────────────

    /**
     * Shows or repositions the floating toolbar above [inputBounds].
     * Safe to call rapidly — position updates are debounced.
     */
    fun showOverlay(inputBounds: Rect? = null) {
        mainHandler.post {
            val wm = windowManager ?: return@post
            val density = resources.displayMetrics.density
            val screenH = resources.displayMetrics.heightPixels
            val overlayH = overlayView?.height?.takeIf { it > 0 } ?: (88 * density).toInt()

            val targetY: Int = when {
                inputBounds != null && inputBounds.top > overlayH + (24 * density).toInt() ->
                    (inputBounds.top - overlayH - (6 * density).toInt())
                        .coerceIn(0, screenH - overlayH)
                else ->
                    // Keyboard not yet open or bounds are zero — park at ~50% height
                    (screenH * 0.50f).toInt()
            }

            if (isOverlayShowing && overlayView != null && currentParams != null) {
                // Debounced position update
                val delta = Math.abs(targetY - lastTargetY)
                if (delta <= POSITION_THRESHOLD_PX) return@post   // trivial move, skip

                pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
                val r = Runnable {
                    if (!isOverlayShowing) return@Runnable
                    currentParams?.y = targetY
                    lastTargetY = targetY
                    try {
                        wm.updateViewLayout(overlayView, currentParams)
                        Log.v(TAG, "Position -> y=$targetY")
                    } catch (e: Exception) {
                        Log.w(TAG, "updateViewLayout: ${e.message}")
                    }
                }
                pendingPositionUpdate = r
                mainHandler.postDelayed(r, POSITION_DEBOUNCE_MS)
                return@post
            }

            // First show: inflate view
            val inflater = LayoutInflater.from(this@OverlayService)
            val view = inflater.inflate(R.layout.overlay_panel, null)

            view.findViewById<View>(R.id.btn_close)?.setOnClickListener {
                hideOverlay()
            }
            view.findViewById<View>(R.id.btn_mic)?.setOnClickListener {
                Toast.makeText(applicationContext, "🎤 Voice (Gnani Prisma) — coming soon", Toast.LENGTH_SHORT).show()
            }
            view.findViewById<View>(R.id.btn_tone)?.setOnClickListener {
                Toast.makeText(applicationContext, "🎨 Tone Rewrite (Gnani Evon) — coming soon", Toast.LENGTH_SHORT).show()
            }
            view.findViewById<View>(R.id.btn_factcheck)?.setOnClickListener {
                Toast.makeText(applicationContext, "✅ Fact Check — coming soon", Toast.LENGTH_SHORT).show()
            }
            view.findViewById<View>(R.id.btn_icebreaker)?.setOnClickListener {
                Toast.makeText(applicationContext, "❄️ Icebreaker — coming soon", Toast.LENGTH_SHORT).show()
            }

            val params = buildLayoutParams(targetY)

            // Drag handle
            val dragHandle = view.findViewById<View>(R.id.drag_handle)
            var dY = 0; var iY = 0f
            dragHandle?.setOnTouchListener { _, ev ->
                when (ev.action) {
                    MotionEvent.ACTION_DOWN -> { dY = currentParams?.y ?: 0; iY = ev.rawY; true }
                    MotionEvent.ACTION_MOVE -> {
                        val ny = (dY + (ev.rawY - iY).toInt()).coerceIn(0, screenH - overlayH)
                        currentParams?.let { p -> p.y = ny; lastTargetY = ny
                            try { wm.updateViewLayout(view, p) } catch (_: Exception) {} }
                        true
                    }
                    else -> false
                }
            }

            try {
                wm.addView(view, params)
                overlayView = view
                currentParams = params
                isOverlayShowing = true
                lastTargetY = targetY
                Log.i(TAG, "Overlay shown at y=$targetY")
            } catch (e: Exception) {
                Log.e(TAG, "addView failed: ${e.message}")
            }
        }
    }

    /** Hides and detaches the overlay. Idempotent. */
    fun hideOverlay() {
        mainHandler.post {
            pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
            pendingPositionUpdate = null
            val view = overlayView ?: return@post
            try { windowManager?.removeView(view) }
            catch (e: Exception) { Log.w(TAG, "removeView: ${e.message}") }
            finally {
                overlayView = null; currentParams = null
                isOverlayShowing = false; lastTargetY = -1
                Log.i(TAG, "Overlay hidden.")
            }
        }
    }

    fun isShowing(): Boolean = isOverlayShowing

    // ───────────────────────────────────────────────────────────────
    // Badge (Phase 2)
    // ───────────────────────────────────────────────────────────────

    private fun updateBadge(count: Int) {
        val badge = overlayView?.findViewById<TextView>(R.id.context_badge) ?: return
        if (count > 0) {
            badge.visibility = View.VISIBLE
            badge.text = if (count > 99) "99+" else count.toString()
        } else {
            badge.visibility = View.GONE
        }
    }

    // ───────────────────────────────────────────────────────────────
    // WindowManager params
    // ───────────────────────────────────────────────────────────────

    private fun buildLayoutParams(yPos: Int): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0; y = yPos
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Foreground notification
    // ───────────────────────────────────────────────────────────────

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                NOTIF_CHANNEL_ID, "IndicContext Copilot",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Keeps copilot ready"; setShowBadge(false) }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
        }

        val stopPi = PendingIntent.getService(
            this, 0,
            Intent(this, OverlayService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, NOTIF_CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)

        return builder
            .setContentTitle("IndicContext Copilot")
            .setContentText("Tap a chat input in WhatsApp or Telegram to activate.")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi)
            .setOngoing(true)
            .build()
    }
}
