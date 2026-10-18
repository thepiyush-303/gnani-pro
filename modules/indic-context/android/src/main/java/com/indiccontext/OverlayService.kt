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
import android.widget.ImageButton
import android.widget.Toast

/**
 * OverlayService
 *
 * Manages the floating IndicContext copilot toolbar.
 *
 * Key Behavior:
 * - When started from the dashboard, it starts as a foreground service with an ongoing notification.
 * - It does NOT display the overlay immediately.
 * - The overlay view is shown only when an input field is focused in a supported messaging app.
 * - The overlay view automatically docks right above the focused input field / keyboard.
 * - The overlay view is automatically removed when navigating away or switching to unsupported apps.
 * - Users can drag the handle to adjust position, or tap the close (✕) button to dismiss.
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var currentParams: WindowManager.LayoutParams? = null
    private var isOverlayShowing = false
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        private const val TAG = "OverlayService"
        private const val NOTIF_CHANNEL_ID = "indic_copilot_channel"
        private const val NOTIF_ID = 1001
        private const val ACTION_STOP = "com.indiccontext.ACTION_STOP_OVERLAY"

        @Volatile
        var instance: OverlayService? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        Log.i(TAG, "OverlayService created.")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i(TAG, "Stop action received from notification.")
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIF_ID, buildNotification())
        // Deliberately NOT calling showOverlay() here!
        // Overlay will be triggered automatically when typing in a supported chat app.

        Log.i(TAG, "OverlayService started. Foreground notification active.")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        hideOverlay()
        instance = null
        Log.i(TAG, "OverlayService destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ───────────────────────────────────────────────────────────────
    // Overlay view management
    // ───────────────────────────────────────────────────────────────

    /**
     * Shows or updates the floating overlay panel positioned above the focused input field.
     */
    fun showOverlay(inputBounds: Rect? = null) {
        mainHandler.post {
            val wm = windowManager ?: return@post

            val displayMetrics = resources.displayMetrics
            val density = displayMetrics.density
            val screenHeight = displayMetrics.heightPixels
            val overlayHeightPx = overlayView?.height?.takeIf { it > 0 } ?: (68 * density).toInt()

            val targetY = if (inputBounds != null && inputBounds.top > 0) {
                // Dock directly above the top edge of the focused input field
                (inputBounds.top - overlayHeightPx - (6 * density).toInt())
                    .coerceIn((48 * density).toInt(), screenHeight - overlayHeightPx - (48 * density).toInt())
            } else {
                // Fallback: place around 45% of screen height
                (screenHeight * 0.45f).toInt()
            }

            // If already showing, update position dynamically if it moved
            if (isOverlayShowing && overlayView != null && currentParams != null) {
                if (currentParams?.y != targetY) {
                    currentParams?.y = targetY
                    try {
                        wm.updateViewLayout(overlayView, currentParams)
                    } catch (e: Exception) {
                        Log.w(TAG, "updateViewLayout failed", e)
                    }
                }
                return@post
            }

            val inflater = LayoutInflater.from(this)
            val view = inflater.inflate(R.layout.overlay_panel, null)

            // Close button: allows user to dismiss the overlay immediately
            view.findViewById<View>(R.id.btn_close)?.setOnClickListener {
                Log.d(TAG, "Overlay close button tapped.")
                hideOverlay()
            }

            // Phase 1 stubs
            view.findViewById<ImageButton>(R.id.btn_mic)?.setOnClickListener {
                Log.d(TAG, "[Phase 1 stub] Mic button tapped")
                Toast.makeText(applicationContext, "🎤 Voice Copilot (Gnani Prisma)", Toast.LENGTH_SHORT).show()
            }
            view.findViewById<ImageButton>(R.id.btn_tone)?.setOnClickListener {
                Log.d(TAG, "[Phase 1 stub] Tone button tapped")
                Toast.makeText(applicationContext, "🎨 Tone Rewrite (Gnani Evon)", Toast.LENGTH_SHORT).show()
            }
            view.findViewById<ImageButton>(R.id.btn_icebreaker)?.setOnClickListener {
                Log.d(TAG, "[Phase 1 stub] Icebreaker button tapped")
                Toast.makeText(applicationContext, "❄️ Icebreaker suggestions", Toast.LENGTH_SHORT).show()
            }

            val params = buildLayoutParams(targetY)

            // Drag handle to allow repositioning if desired
            val dragHandle = view.findViewById<View>(R.id.drag_handle)
            var initialY = 0
            var initialTouchY = 0f
            dragHandle?.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialY = params.y
                        initialTouchY = event.rawY
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val newY = (initialY + (event.rawY - initialTouchY).toInt())
                            .coerceIn((30 * density).toInt(), screenHeight - (overlayView?.height ?: (70 * density).toInt()))
                        params.y = newY
                        try {
                            wm.updateViewLayout(view, params)
                        } catch (e: Exception) {
                            // View might not be attached
                        }
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
                Log.i(TAG, "Overlay shown above input at y=$targetY.")
            } catch (e: Exception) {
                Log.e(TAG, "Error adding overlay view to WindowManager", e)
            }
        }
    }

    /**
     * Removes the overlay view from the WindowManager.
     */
    fun hideOverlay() {
        mainHandler.post {
            val view = overlayView ?: return@post
            try {
                windowManager?.removeView(view)
            } catch (e: Exception) {
                Log.w(TAG, "hideOverlay: exception removing view", e)
            } finally {
                overlayView = null
                currentParams = null
                isOverlayShowing = false
                Log.i(TAG, "Overlay hidden.")
            }
        }
    }

    fun isShowing(): Boolean = isOverlayShowing

    // ───────────────────────────────────────────────────────────────
    // WindowManager layout params
    // ───────────────────────────────────────────────────────────────

    private fun buildLayoutParams(yPos: Int): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

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
            x = 0
            y = yPos
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Foreground notification
    // ───────────────────────────────────────────────────────────────

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIF_CHANNEL_ID,
                "IndicContext Copilot",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Keeps the copilot active for chat apps"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                ?.createNotificationChannel(channel)
        }

        val stopIntent = Intent(this, OverlayService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIF_CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("🧠 IndicContext Copilot Active")
            .setContentText("Auto-activates when typing in WhatsApp & Telegram.")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop Copilot",
                stopPendingIntent
            )
            .setOngoing(true)
            .build()
    }
}
