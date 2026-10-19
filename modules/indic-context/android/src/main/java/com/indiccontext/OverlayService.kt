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
 * OverlayService — Phase 3
 *
 * Supports two modes selectable from the dashboard:
 *
 * INPUT_BAR mode (default):
 *   - The toolbar is completely hidden until [ChatAccessibilityService] detects
 *     that an EditText inside a supported chat app gained focus (keyboard opened).
 *   - [showToolbar] is called with the input field's on-screen bounds so the
 *     toolbar can dock directly above the keyboard.
 *   - The toolbar is immediately hidden when:
 *       • The input field loses focus ([hideToolbar]).
 *       • The user leaves the supported app ([hideToolbar]).
 *       • The user taps the ✕ close button.
 *   - The overlay view is completely REMOVED from WindowManager when hidden —
 *     it is never just made invisible or moved off-screen.
 *
 * EDGE_SLIDER mode:
 *   - A small faded pill is docked to the right edge of the screen whenever
 *     a supported app is in the foreground ([showEdgePill]).
 *   - Tapping the pill expands the full toolbar in place ([expandToToolbar]).
 *   - The pill/toolbar is removed when the user leaves the supported app ([hideEdgePill]).
 *   - The pill is at ~40% screen height (vertically centred-ish) and is
 *     semi-transparent so it does not obscure content.
 *
 * Anti-flicker safeguards (preserved from Phase 2):
 *   - Position updates debounced at 60ms / 10px threshold.
 *   - All WindowManager calls dispatched onto the main thread.
 *   - [hideToolbar] and [hideEdgePill] are idempotent.
 */
class OverlayService : Service() {

    // ── WindowManager state ───────────────────────────────────────────
    private var windowManager: WindowManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // INPUT_BAR state
    private var toolbarView: View? = null
    private var toolbarParams: WindowManager.LayoutParams? = null
    private var isToolbarShowing = false

    // Position debounce (INPUT_BAR)
    private var lastTargetY = -1
    private val POSITION_THRESHOLD_PX = 10
    private val POSITION_DEBOUNCE_MS = 60L
    private var pendingPositionUpdate: Runnable? = null

    // EDGE_SLIDER state
    private var edgeView: View? = null
    private var isEdgeShowing = false
    private var isEdgeExpanded = false

    // ── Badge counter ─────────────────────────────────────────────────
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

        /** Current mode — changed via [setMode]. Read by ChatAccessibilityService. */
        @Volatile
        var currentMode: OverlayMode = OverlayMode.INPUT_BAR

        @Volatile
        var instance: OverlayService? = null
            private set
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        Log.i(TAG, "Created. mode=$currentMode")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        // Read mode from intent extra (set by IndicContextModule.startOverlay)
        intent?.getStringExtra("mode")?.let { currentMode = OverlayMode.from(it) }
        startForeground(NOTIF_ID, buildNotification())
        Log.i(TAG, "Started. mode=$currentMode — waiting for trigger.")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        hideToolbar()
        hideEdgePill()
        instance = null
        Log.i(TAG, "Destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Public mode API ───────────────────────────────────────────────

    /**
     * Change overlay mode at runtime (called from JS via IndicContextModule).
     * Tears down any currently-showing view from the old mode before switching.
     */
    fun setMode(mode: OverlayMode) {
        mainHandler.post {
            if (mode == currentMode) return@post
            Log.i(TAG, "Mode change: $currentMode → $mode")
            // Tear down old mode's view
            hideToolbar()
            hideEdgePill()
            currentMode = mode
        }
    }

    // ── INPUT_BAR — show/hide toolbar ─────────────────────────────────

    /**
     * Show (or reposition) the toolbar above [inputBounds].
     * Called ONLY when an EditText gains focus inside a supported app.
     * In EDGE_SLIDER mode this is a no-op.
     */
    fun showToolbar(inputBounds: Rect? = null) {
        if (currentMode != OverlayMode.INPUT_BAR) return
        mainHandler.post {
            val wm = windowManager ?: return@post
            val density = resources.displayMetrics.density
            val screenH = resources.displayMetrics.heightPixels
            val tbH = toolbarView?.height?.takeIf { it > 0 } ?: (88 * density).toInt()

            // Position the toolbar just above the input field / keyboard.
            // If bounds are unavailable, park at 60% height (still below mid-screen).
            val targetY: Int = if (
                inputBounds != null && inputBounds.top > tbH + (24 * density).toInt()
            ) {
                (inputBounds.top - tbH - (6 * density).toInt())
                    .coerceIn(0, screenH - tbH)
            } else {
                // Input bounds unknown yet — place at 60% and wait for a real update.
                // This is NOT shown until bounds arrive from the accessibility event.
                (screenH * 0.60f).toInt()
            }

            // If already showing: just update position (debounced)
            if (isToolbarShowing && toolbarView != null && toolbarParams != null) {
                val delta = Math.abs(targetY - lastTargetY)
                if (delta <= POSITION_THRESHOLD_PX) return@post

                pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
                val r = Runnable {
                    if (!isToolbarShowing) return@Runnable
                    toolbarParams?.y = targetY
                    lastTargetY = targetY
                    try { wm.updateViewLayout(toolbarView, toolbarParams) }
                    catch (e: Exception) { Log.w(TAG, "updateViewLayout: ${e.message}") }
                }
                pendingPositionUpdate = r
                mainHandler.postDelayed(r, POSITION_DEBOUNCE_MS)
                return@post
            }

            // First show: inflate and add to window
            val view = inflateEdgePill(wm)
            val params = buildToolbarParams(targetY)
            try {
                wm.addView(view, params)
                toolbarView = view
                toolbarParams = params
                isToolbarShowing = true
                lastTargetY = targetY
                Log.i(TAG, "Toolbar shown at y=$targetY")
            } catch (e: Exception) {
                Log.e(TAG, "addView(toolbar) failed: ${e.message}")
            }
        }
    }

    /** Completely removes the toolbar from the screen. Idempotent. */
    fun hideToolbar() {
        mainHandler.post {
            pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
            pendingPositionUpdate = null
            val view = toolbarView ?: return@post
            try { windowManager?.removeView(view) }
            catch (e: Exception) { Log.w(TAG, "removeView(toolbar): ${e.message}") }
            finally {
                toolbarView = null; toolbarParams = null
                isToolbarShowing = false; lastTargetY = -1
                Log.i(TAG, "Toolbar hidden.")
            }
        }
    }

    fun isToolbarShowing(): Boolean = isToolbarShowing

    // ── EDGE_SLIDER — show pill / expand / collapse / hide ────────────

    /**
     * Show the faded edge pill.
     * Called when a supported app comes to the foreground in EDGE_SLIDER mode.
     */
    fun showEdgePill() {
        if (currentMode != OverlayMode.EDGE_SLIDER) return
        mainHandler.post {
            if (isEdgeShowing) return@post
            val wm = windowManager ?: return@post
            val view = inflateEdgePill(wm)
            val params = buildEdgeParams()
            try {
                wm.addView(view, params)
                edgeView = view
                isEdgeShowing = true
                isEdgeExpanded = false
                Log.i(TAG, "Edge pill shown.")
            } catch (e: Exception) {
                Log.e(TAG, "addView(edge) failed: ${e.message}")
            }
        }
    }

    /** Remove the edge pill (and toolbar if expanded). Idempotent. */
    fun hideEdgePill() {
        mainHandler.post {
            val view = edgeView ?: return@post
            try { windowManager?.removeView(view) }
            catch (e: Exception) { Log.w(TAG, "removeView(edge): ${e.message}") }
            finally {
                edgeView = null
                isEdgeShowing = false
                isEdgeExpanded = false
                Log.i(TAG, "Edge pill hidden.")
            }
        }
    }

    // ── Badge ─────────────────────────────────────────────────────────

    private fun updateBadge(count: Int) {
        val target = when {
            isToolbarShowing -> toolbarView
            isEdgeExpanded   -> edgeView
            else             -> return
        }
        val badge = target?.findViewById<TextView>(R.id.context_badge) ?: return
        if (count > 0) {
            badge.visibility = View.VISIBLE
            badge.text = if (count > 99) "99+" else count.toString()
        } else {
            badge.visibility = View.GONE
        }
    }

    // ── View inflation helpers ─────────────────────────────────────────

    private fun inflateToolbar(wm: WindowManager, screenH: Int): View {
        val view = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null)

        view.findViewById<View>(R.id.btn_close)?.setOnClickListener {
            hideToolbar()
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

        // Large, comfortable drag bar
        var dragStartX = 0
        var dragStartY = 0
        var dragStartRawX = 0f
        var dragStartRawY = 0f
        val density = resources.displayMetrics.density
        val screenH = resources.displayMetrics.heightPixels
        val overlayH = (88 * density).toInt()

        val dragArea = view.findViewById<View>(R.id.drag_bar) ?: view.findViewById<View>(R.id.drag_handle)
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        dragArea?.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    val params = view.layoutParams as? WindowManager.LayoutParams ?: return@setOnTouchListener false
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = ev.rawX
                    initialTouchY = ev.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val params = view.layoutParams as? WindowManager.LayoutParams ?: return@setOnTouchListener false
                    
                    // Calculate new position based on finger movement
                    params.x = initialX + (ev.rawX - initialTouchX).toInt()
                    
                    // Prevent dragging too far off the bottom of the screen
                    val newY = initialY + (ev.rawY - initialTouchY).toInt()
                    params.y = newY.coerceIn(0, screenH - overlayH)
                    
                    // Update global tracker and move view
                    lastTargetY = params.y
                    toolbarParams?.x = params.x
                    toolbarParams?.y = params.y
                    
                    try { wm.updateViewLayout(view, params) }
                    catch (e: Exception) { /* ignore during rapid dragging */ }
                    true
                }
                else -> false
            }
        }
        return view
    }

    private fun inflateEdgePill(wm: WindowManager): View {
        // Reuse overlay_panel layout for the expanded state;
        // the edge tab is a small strip on the right that acts as a handle.
        val view = LayoutInflater.from(this).inflate(R.layout.edge_pill, null)

        val edgeTab = view.findViewById<View>(R.id.edge_tab_container`)
        
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        edgeTab?.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    val params = view.layoutParams as? WindowManager.LayoutParams ?: return@setOnTouchListener false
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true 
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = Math.abs(event.rawX - initialTouchX)
                    val dy = Math.abs(event.rawY - initialTouchY)
                    if (dx > 10 || dy > 10) isDragging = true

                    if (isDragging) {
                        val params = view.layoutParams as? WindowManager.LayoutParams ?: return@setOnTouchListener false
                        params.x = initialX + (event.rawX - initialTouchX).toInt()
                        params.y = initialY + (event.rawY - initialTouchY).toInt()
                        
                        // Update global tracker so it doesn't snap back
                        lastTargetY = params.y 
                        toolbarParams?.x = params.x
                        toolbarParams?.y = params.y
                        
                        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) expandToToolbar(view, wm)
                    true
                }
                else -> false
            }
        }
        // Collapse on close
        view.findViewById<View>(R.id.edge_toolbar_close)?.setOnClickListener {
            collapseToEdgePill(view, wm)
        }
        view.findViewById<View>(R.id.edge_btn_mic)?.setOnClickListener {
            Toast.makeText(applicationContext, "🎤 Voice — coming soon", Toast.LENGTH_SHORT).show()
        }
        view.findViewById<View>(R.id.edge_btn_tone)?.setOnClickListener {
            Toast.makeText(applicationContext, "🎨 Tone — coming soon", Toast.LENGTH_SHORT).show()
        }
        view.findViewById<View>(R.id.edge_btn_factcheck)?.setOnClickListener {
            Toast.makeText(applicationContext, "✅ Fact — coming soon", Toast.LENGTH_SHORT).show()
        }
        view.findViewById<View>(R.id.edge_btn_icebreaker)?.setOnClickListener {
            Toast.makeText(applicationContext, "❄️ Ice — coming soon", Toast.LENGTH_SHORT).show()
        }

        // Tapping outside the expanded toolbar collapses it back to the edge pill
        view.setOnTouchListener { _, ev ->
            if (ev.action == MotionEvent.ACTION_OUTSIDE && isEdgeExpanded) {
                collapseToEdgePill(view, wm)
                true
            } else {
                false
            }
        }

        return view
    }

    private fun expandToToolbar(view: View, wm: WindowManager) {
        view.findViewById<View>(R.id.edge_tab_container)?.visibility = View.GONE
        view.findViewById<View>(R.id.edge_toolbar_container)?.visibility = View.VISIBLE
        isEdgeExpanded = true
        // Update layout to full width
        edgeView?.let { v ->
            val p = buildEdgeParams(expanded = true)
            try { wm.updateViewLayout(v, p) } catch (e: Exception) {}
        }
        Log.d(TAG, "Edge expanded to toolbar.")
    }

    private fun collapseToEdgePill(view: View, wm: WindowManager) {
        view.findViewById<View>(R.id.edge_toolbar_container)?.visibility = View.GONE
        view.findViewById<View>(R.id.edge_tab_container)?.visibility = View.VISIBLE
        isEdgeExpanded = false
        edgeView?.let { v ->
            val p = buildEdgeParams(expanded = false)
            try { wm.updateViewLayout(v, p) } catch (e: Exception) {}
        }
        Log.d(TAG, "Edge collapsed to pill.")
    }

    // ── WindowManager params ──────────────────────────────────────────

    private fun buildToolbarParams(yPos: Int): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
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

    private fun buildEdgeParams(expanded: Boolean = false): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val screenH = resources.displayMetrics.heightPixels
        val yPos = (screenH * 0.38f).toInt()  // ~38% from top — avoids status bar and nav bar

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                (if (expanded) WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH else 0),
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0; y = yPos
        }
    }

    // ── Foreground notification ───────────────────────────────────────

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
            .setContentText("Active in WhatsApp & Telegram.")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi)
            .setOngoing(true)
            .build()
    }
}
