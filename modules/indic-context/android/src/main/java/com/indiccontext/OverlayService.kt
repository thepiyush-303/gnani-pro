package com.indiccontext

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton

/**
 * OverlayService — Phase 1 Scaffold
 *
 * Draws the floating IndicContext copilot panel above the stock keyboard
 * using SYSTEM_ALERT_WINDOW permission and Android's [WindowManager].
 *
 * ## Lifecycle (Option B — Manual Toggle + Auto-show)
 * - Started via [IndicContextModule.startOverlay] when the user enables the
 *   copilot from the dashboard.
 * - Shows/hides the panel based on [ChatAccessibilityService] input field
 *   focus events (auto-show when a supported app's input is focused).
 * - A persistent foreground notification keeps the service alive and provides
 *   a manual "Stop Copilot" action.
 *
 * ## Overlay Architecture
 * Phase 1: Native Android view inflated from [R.layout.overlay_panel].
 *   → Shows the toolbar: Mic, Tone, Icebreaker buttons + drag handle.
 * Phase 2+: A ReactRootView will be mounted inside the container
 *   to render the full React Native overlay UI.
 *
 * ## SYSTEM_ALERT_WINDOW Requirement
 * This service MUST NOT be started unless [Settings.canDrawOverlays] is true.
 * [IndicContextModule.startOverlay] enforces this check before starting the service.
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var isOverlayShowing = false

    companion object {
        private const val TAG = "OverlayService"
        private const val NOTIF_CHANNEL_ID = "indic_copilot_channel"
        private const val NOTIF_ID = 1001
        private const val ACTION_STOP = "com.indiccontext.ACTION_STOP_OVERLAY"

        /**
         * Singleton reference so [IndicContextModule] can show/hide the overlay
         * without needing a full service binding.
         */
        @Volatile
        var instance: OverlayService? = null
            private set
    }

    // ───────────────────────────────────────────────────────────────
    // Lifecycle
    // ───────────────────────────────────────────────────────────────

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
        showOverlay()

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
     * Inflates the overlay panel view and adds it to the [WindowManager].
     * Called from [onStartCommand].
     *
     * Phase 1: Inflates native XML layout.
     * Phase 2+: Mounts ReactRootView inside the container.
     */
    fun showOverlay() {
        if (isOverlayShowing) return

        val inflater = LayoutInflater.from(this)
        val view = inflater.inflate(R.layout.overlay_panel, null)

        // Wire up Phase 1 button click listeners (stubs for now)
        view.findViewById<ImageButton>(R.id.btn_mic)?.setOnClickListener {
            Log.d(TAG, "[Phase 1 stub] Mic button tapped")
            // TODO (Phase 3): trigger AudioCaptureModule.startRecording()
        }
        view.findViewById<ImageButton>(R.id.btn_tone)?.setOnClickListener {
            Log.d(TAG, "[Phase 1 stub] Tone button tapped")
            // TODO (Phase 4): expand tone/temperature panel
        }
        view.findViewById<ImageButton>(R.id.btn_icebreaker)?.setOnClickListener {
            Log.d(TAG, "[Phase 1 stub] Icebreaker button tapped")
            // TODO (Phase 6): generate icebreaker suggestions
        }

        val params = buildLayoutParams()
        windowManager?.addView(view, params)
        overlayView = view
        isOverlayShowing = true

        Log.i(TAG, "Overlay shown.")
    }

    /**
     * Removes the overlay view from the [WindowManager].
     * Safe to call even if the overlay isn't showing.
     */
    fun hideOverlay() {
        val view = overlayView ?: return
        try {
            windowManager?.removeView(view)
        } catch (e: Exception) {
            Log.w(TAG, "hideOverlay: exception removing view", e)
        } finally {
            overlayView = null
            isOverlayShowing = false
            Log.i(TAG, "Overlay hidden.")
        }
    }

    fun isShowing(): Boolean = isOverlayShowing

    // ───────────────────────────────────────────────────────────────
    // WindowManager layout params
    // ───────────────────────────────────────────────────────────────

    private fun buildLayoutParams(): WindowManager.LayoutParams {
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
            // NOT_FOCUSABLE: touch events pass through to the keyboard/chat app underneath.
            // WATCH_OUTSIDE_TOUCH: we receive outside touch events (used later for auto-hide).
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM  // Sits just above the keyboard area
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Foreground notification
    // ───────────────────────────────────────────────────────────────

    private fun buildNotification(): Notification {
        // Create notification channel (required API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIF_CHANNEL_ID,
                "IndicContext Copilot",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Keeps the copilot overlay running"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                ?.createNotificationChannel(channel)
        }

        // Stop action intent
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
            .setContentText("Floating overlay is running above your keyboard.")
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
