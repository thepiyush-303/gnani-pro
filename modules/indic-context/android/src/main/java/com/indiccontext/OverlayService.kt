package com.indiccontext

import android.Manifest
import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat

/**
 * OverlayService — Dark Glassmorphism Edition
 *
 * Updates:
 * 1. Full Draggability & Edge Snapping (The Ring & The Toolbar):
 *    - Touches on ring or any non-button area of toolbar drag smoothly.
 *    - On release, snaps flush (0px gap) to left or right screen edge.
 *    - Persists edge state ('left' | 'right').
 *
 * 2. Drag-to-Disable Drop Zone:
 *    - Bottom-center cross (✕) drop zone appears while dragging the collapsed ring.
 *    - Intersection detection scales drop zone to 1.2x and illuminates destructive red.
 *    - Dropping into zone completely unmounts and disables the copilot overlay.
 *
 * 3. Dynamic Layout Reversal & Flush Bezel Fit:
 *    - If on LEFT: Action buttons on left -> divider -> collapse button (<) on far right. Flush left: 0.
 *    - If on RIGHT: Collapse button (>) on far left -> divider -> action buttons on right. Flush right: 0.
 *
 * 4. Zero Layout Shift for Mic Language Popup + Downward Caret.
 * 5. Silent Internal Message Buffer Tracking (no visible badges).
 */
class OverlayService : Service() {

    enum class Edge { LEFT, RIGHT }

    private var windowManager: WindowManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Window State ──
    private var overlayRootView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var isOverlayShowing = false
    private var isExpanded = false

    // Edge docking & snapping
    private var currentEdge: Edge = Edge.LEFT
    private var lastTargetY = -1
    private val POSITION_THRESHOLD_PX = 10
    private val POSITION_DEBOUNCE_MS = 60L
    private var pendingPositionUpdate: Runnable? = null

    // ── Drop Zone State (Drag to Disable) ──
    private var dropZoneView: View? = null
    private var dropZoneParams: WindowManager.LayoutParams? = null
    private var isHoveringDropZone = false

    // ── Language State ──
    private var activeLanguageCode = "en-IN"
    private var activeLanguageBadge = "EN"

    // ── Voice Recorder ──
    private lateinit var voiceRecorder: VoiceRecorder
    private var isTranscribing = false

    // ── Badge Counter (Silent background tracking, no UI badges) ──
    var contextMessageCount: Int = 0
        set(value) {
            field = value
        }

    companion object {
        private const val TAG = "OverlayService"
        private const val NOTIF_CHANNEL_ID = "indic_copilot_channel"
        private const val NOTIF_ID = 1001
        const val ACTION_STOP = "com.indiccontext.ACTION_STOP_OVERLAY"

        @Volatile
        var isCopilotActive: Boolean = false

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

        // Load persisted preferences
        val prefs = getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
        val savedEdge = prefs.getString("overlay_edge", "left") ?: "left"
        currentEdge = if (savedEdge == "right") Edge.RIGHT else Edge.LEFT

        activeLanguageCode = prefs.getString("gnani_language", "en-IN") ?: "en-IN"
        activeLanguageBadge = when (activeLanguageCode) {
            "hi-IN" -> "HI"
            "mr-IN" -> "MR"
            "bn-IN" -> "BN"
            "te-IN" -> "TE"
            "ta-IN" -> "TA"
            "ml-IN" -> "ML"
            else -> "EN"
        }
        GnaniSttClient.currentLanguage = activeLanguageCode

        voiceRecorder = VoiceRecorder(applicationContext)
        voiceRecorder.onTimeoutListener = {
            mainHandler.post {
                if (voiceRecorder.isRecording()) {
                    Log.i(TAG, "Voice recording reached maximum duration -> auto transcribing.")
                    toggleVoiceRecording()
                }
            }
        }
        Log.i(TAG, "Created. Edge=$currentEdge, Lang=$activeLanguageCode")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            isCopilotActive = false
            hideOverlay()
            stopSelf()
            return START_NOT_STICKY
        }
        isCopilotActive = true
        startForeground(NOTIF_ID, buildNotification())
        Log.i(TAG, "Started. isCopilotActive=true")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isCopilotActive = false
        if (::voiceRecorder.isInitialized && voiceRecorder.isRecording()) {
            voiceRecorder.cancel()
        }
        hideOverlay()
        instance = null
        Log.i(TAG, "Destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    fun setMode(mode: OverlayMode) {
        currentMode = mode
    }

    // ── Show / Reposition Overlay ─────────────────────────────────────

    fun showOverlay(inputBounds: Rect? = null) {
        if (!isCopilotActive) return

        mainHandler.post {
            val wm = windowManager ?: return@post
            val density = resources.displayMetrics.density
            val screenH = resources.displayMetrics.heightPixels
            val diskH = (44 * density).toInt()

            val targetY: Int = if (inputBounds != null && inputBounds.top > diskH + (10 * density).toInt()) {
                (inputBounds.top - diskH - (4 * density).toInt()).coerceIn(0, screenH - diskH)
            } else {
                (screenH * 0.58f).toInt()
            }

            if (isOverlayShowing && overlayRootView != null && overlayParams != null) {
                val delta = Math.abs(targetY - lastTargetY)
                if (delta <= POSITION_THRESHOLD_PX) return@post

                pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
                val r = Runnable {
                    if (!isOverlayShowing) return@Runnable
                    overlayParams?.y = targetY
                    lastTargetY = targetY
                    try { wm.updateViewLayout(overlayRootView, overlayParams) }
                    catch (e: Exception) { Log.w(TAG, "updateViewLayout: ${e.message}") }
                }
                pendingPositionUpdate = r
                mainHandler.postDelayed(r, POSITION_DEBOUNCE_MS)
                return@post
            }

            // First show: inflate and mount
            val view = inflateOverlayView(wm)
            val params = buildOverlayParams(targetY, isExpanded)
            try {
                wm.addView(view, params)
                overlayRootView = view
                overlayParams = params
                isOverlayShowing = true
                lastTargetY = targetY
                applyEdgeLayout(currentEdge)
                Log.i(TAG, "Overlay shown at y=$targetY (edge=$currentEdge)")
            } catch (e: Exception) {
                Log.e(TAG, "addView(overlay) failed: ${e.message}")
            }
        }
    }

    fun showToolbar(inputBounds: Rect? = null) = showOverlay(inputBounds)
    fun showEdgePill() = showOverlay(null)

    // ── Hide Overlay ──────────────────────────────────────────────────

    fun hideOverlay() {
        mainHandler.post {
            pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
            pendingPositionUpdate = null
            hideDropZone()
            val view = overlayRootView ?: return@post
            try {
                windowManager?.removeView(view)
            } catch (e: Exception) {
                Log.w(TAG, "removeView(overlay): ${e.message}")
            } finally {
                overlayRootView = null
                overlayParams = null
                isOverlayShowing = false
                isExpanded = false
                lastTargetY = -1
                Log.i(TAG, "Overlay completely hidden.")
            }
        }
    }

    fun hideToolbar() = hideOverlay()
    fun hideEdgePill() = hideOverlay()
    fun isToolbarShowing(): Boolean = isOverlayShowing

    // ── Drop Zone (Drag to Disable) ───────────────────────────────────

    private fun showDropZone() {
        if (dropZoneView != null) return
        val wm = windowManager ?: return

        try {
            val dz = LayoutInflater.from(this).inflate(R.layout.overlay_drop_zone, null)
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            val density = resources.displayMetrics.density
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                x = 0
                y = (40 * density).toInt()
            }

            wm.addView(dz, params)
            dropZoneView = dz
            dropZoneParams = params
            isHoveringDropZone = false

            dz.alpha = 0f
            dz.scaleX = 0.7f
            dz.scaleY = 0.7f
            dz.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start()
            Log.d(TAG, "Drop zone mounted at bottom center.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show drop zone: ${e.message}")
        }
    }

    private fun updateDropZoneHoverState(isHovering: Boolean) {
        if (isHovering == isHoveringDropZone) return
        isHoveringDropZone = isHovering
        val dz = dropZoneView ?: return

        val circle = dz.findViewById<FrameLayout>(R.id.drop_zone_circle)
        val icon = dz.findViewById<TextView>(R.id.drop_zone_icon)
        val label = dz.findViewById<TextView>(R.id.drop_zone_label)

        if (isHovering) {
            circle?.setBackgroundResource(R.drawable.drop_zone_bg_active)
            icon?.animate()?.scaleX(1.2f)?.scaleY(1.2f)?.setDuration(120)?.start()
            label?.setTextColor(Color.parseColor("#EF4444"))
            try {
                overlayRootView?.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            } catch (e: Exception) {}
        } else {
            circle?.setBackgroundResource(R.drawable.drop_zone_bg_idle)
            icon?.animate()?.scaleX(1.0f)?.scaleY(1.0f)?.setDuration(120)?.start()
            label?.setTextColor(Color.parseColor("#94A3B8"))
        }
    }

    private fun hideDropZone() {
        val dz = dropZoneView ?: return
        val wm = windowManager ?: return
        dropZoneView = null
        dropZoneParams = null
        isHoveringDropZone = false

        try {
            dz.animate()
                .alpha(0f)
                .scaleX(0.7f)
                .scaleY(0.7f)
                .setDuration(120)
                .withEndAction {
                    try { wm.removeView(dz) } catch (e: Exception) {}
                }
                .start()
        } catch (e: Exception) {
            try { wm.removeView(dz) } catch (err: Exception) {}
        }
    }

    fun disableCopilot() {
        Log.i(TAG, "Copilot disabled via Drag-to-Disable drop zone.")
        isCopilotActive = false
        hideDropZone()
        hideOverlay()

        getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("copilot_enabled", false)
            .apply()

        IndicContextModule.instance?.emitCopilotDisabled()
        Toast.makeText(applicationContext, "Assistant Copilot disabled", Toast.LENGTH_SHORT).show()
        stopSelf()
    }

    // ── Dynamic Edge Layout Reversal & Flush Bezel Fit ─────────────────

    private fun applyEdgeLayout(edge: Edge) {
        val root = overlayRootView ?: return
        val toolbar = root.findViewById<LinearLayout>(R.id.toolbar_container) ?: return
        val collapseBtn = root.findViewById<FrameLayout>(R.id.btn_collapse_handle) ?: return
        val collapseArrow = root.findViewById<TextView>(R.id.collapse_arrow) ?: return
        val divider = root.findViewById<View>(R.id.toolbar_divider) ?: return
        val actionButtons = root.findViewById<LinearLayout>(R.id.action_buttons_container) ?: return
        val density = resources.displayMetrics.density

        toolbar.removeView(collapseBtn)
        toolbar.removeView(divider)
        toolbar.removeView(actionButtons)

        if (edge == Edge.LEFT) {
            // LEFT edge: Action buttons on left -> divider -> collapse button on far right (<)
            toolbar.addView(actionButtons)
            toolbar.addView(divider)
            toolbar.addView(collapseBtn)

            collapseArrow.text = "‹"
            collapseBtn.setBackgroundResource(R.drawable.btn_collapse_bg_right)
            collapseBtn.setPadding(0, 0, 0, 0)
            (collapseBtn.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.marginStart = (2 * density).toInt()
                lp.marginEnd = 0
                collapseBtn.layoutParams = lp
            }

            // Fully visible 24dp rounded left corners (no negative margins or offscreen shifts)
            toolbar.setBackgroundResource(R.drawable.overlay_bg)
            toolbar.setPadding((6 * density).toInt(), 0, (4 * density).toInt(), 0)

            (toolbar.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                lp.gravity = Gravity.BOTTOM or Gravity.START
                toolbar.layoutParams = lp
            }

            actionButtons.setPadding(0, 0, 0, 0)
        } else {
            // RIGHT edge: Collapse button on far left (>) -> divider -> action buttons on right (flush right)
            toolbar.addView(collapseBtn)
            toolbar.addView(divider)
            toolbar.addView(actionButtons)

            collapseArrow.text = "›"
            collapseBtn.setBackgroundResource(R.drawable.btn_collapse_bg_left)
            collapseBtn.setPadding(0, 0, 0, 0)
            (collapseBtn.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.marginStart = 0
                lp.marginEnd = (2 * density).toInt()
                collapseBtn.layoutParams = lp
            }

            // Fully visible 24dp rounded corners, anchored directly to right bounds
            toolbar.setBackgroundResource(R.drawable.overlay_bg)
            toolbar.setPadding((4 * density).toInt(), 0, (6 * density).toInt(), 0)

            (toolbar.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                lp.gravity = Gravity.BOTTOM or Gravity.END
                toolbar.layoutParams = lp
            }

            actionButtons.setPadding(0, 0, 0, 0)
        }
    }

    // ── Expand & Collapse Transitions ─────────────────────────────────

    private fun expandToToolbar() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels

        isExpanded = true
        params.width = WindowManager.LayoutParams.WRAP_CONTENT

        if (currentEdge == Edge.RIGHT) {
            // Right-edge flush: gravity = TOP | END, x = 0 (right: 0 with 0px gap)
            params.gravity = Gravity.TOP or Gravity.END
            params.x = 0
        } else {
            // Left-edge flush: gravity = TOP | START, x = 0 (left: 0 with fully visible rounded edge)
            params.gravity = Gravity.TOP or Gravity.START
            params.x = 0
        }

        val disk = view.findViewById<View>(R.id.disk_container)
        val toolbar = view.findViewById<View>(R.id.toolbar_container)

        applyEdgeLayout(currentEdge)

        disk?.visibility = View.GONE
        toolbar?.visibility = View.VISIBLE
        toolbar?.alpha = 0f
        toolbar?.scaleX = 0.4f
        toolbar?.pivotX = if (currentEdge == Edge.LEFT) 0f else (view.width.toFloat().takeIf { it > 0 } ?: (screenW * 0.7f))
        toolbar?.animate()?.alpha(1f)?.scaleX(1f)?.setDuration(220)?.start()

        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
        Log.d(TAG, "Expanded into toolbar at $currentEdge edge (flush x=0).")
    }

    private fun collapseToDisk() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return

        isExpanded = false
        params.width = WindowManager.LayoutParams.WRAP_CONTENT

        if (currentEdge == Edge.RIGHT) {
            params.gravity = Gravity.TOP or Gravity.END
            params.x = 0
        } else {
            params.gravity = Gravity.TOP or Gravity.START
            params.x = 0
        }

        val disk = view.findViewById<View>(R.id.disk_container)
        val toolbar = view.findViewById<View>(R.id.toolbar_container)
        val langMenu = view.findViewById<View>(R.id.language_popup_wrapper)

        langMenu?.visibility = View.GONE
        toolbar?.visibility = View.GONE
        disk?.visibility = View.VISIBLE
        disk?.alpha = 0f
        disk?.scaleX = 0.5f
        disk?.scaleY = 0.5f
        disk?.animate()?.alpha(1f)?.scaleX(1f)?.scaleY(1f)?.setDuration(200)?.start()

        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
        Log.d(TAG, "Collapsed back into circular disk at $currentEdge edge (flush x=0).")
    }

    // ── Edge Snapping Animation ──

    private fun snapToNearestEdge(releaseRawX: Float) {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density

        val newEdge = if (releaseRawX < screenW / 2f) Edge.LEFT else Edge.RIGHT
        currentEdge = newEdge

        // Persist edge choice
        getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("overlay_edge", if (newEdge == Edge.LEFT) "left" else "right")
            .apply()

        applyEdgeLayout(newEdge)

        val targetWidth = view.width.takeIf { it > 0 } ?: if (isExpanded) (230 * density).toInt() else (42 * density).toInt()
        val startX = params.x
        val endX = if (newEdge == Edge.LEFT) 0 else (screenW - targetWidth).coerceAtLeast(0)

        // Ensure gravity is Gravity.TOP or Gravity.START during the smooth glide animator
        params.gravity = Gravity.TOP or Gravity.START

        val animator = ValueAnimator.ofInt(startX, endX).apply {
            duration = 180L
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                params.x = anim.animatedValue as Int
                try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
            }
        }
        animator.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                // Lock flush to the physical bezel
                if (newEdge == Edge.RIGHT) {
                    params.gravity = Gravity.TOP or Gravity.END
                    params.x = 0
                } else {
                    params.gravity = Gravity.TOP or Gravity.START
                    params.x = 0
                }
                try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
            }
        })
        animator.start()
    }

    // ── View Inflation & Gesture Wiring ────────────────────────────────

    private fun inflateOverlayView(wm: WindowManager): View {
        val view = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null)

        val diskContainer = view.findViewById<FrameLayout>(R.id.disk_container)
        val toolbarContainer = view.findViewById<LinearLayout>(R.id.toolbar_container)
        val langBadge = view.findViewById<TextView>(R.id.txt_lang_badge)
        val collapseHandle = view.findViewById<FrameLayout>(R.id.btn_collapse_handle)

        if (isExpanded) {
            diskContainer?.visibility = View.GONE
            toolbarContainer?.visibility = View.VISIBLE
        } else {
            diskContainer?.visibility = View.VISIBLE
            toolbarContainer?.visibility = View.GONE
        }

        langBadge?.text = activeLanguageBadge

        // ── 1. Full Draggability for the Disk (with Drop Zone & Drag-to-Disable) ──
        var diskDownX = 0f
        var diskDownY = 0f
        var diskInitialScreenX = 0
        var diskInitialScreenY = 0
        var isDiskDrag = false

        diskContainer?.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    overlayParams ?: return@setOnTouchListener false
                    diskDownX = ev.rawX
                    diskDownY = ev.rawY

                    val loc = IntArray(2)
                    view.getLocationOnScreen(loc)
                    diskInitialScreenX = loc[0]
                    diskInitialScreenY = loc[1]

                    isDiskDrag = false
                    isHoveringDropZone = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - diskDownX
                    val dy = ev.rawY - diskDownY

                    if (Math.hypot(dx.toDouble(), dy.toDouble()) > 8.0) {
                        if (!isDiskDrag) {
                            isDiskDrag = true
                            showDropZone()
                        }

                        val p = overlayParams ?: return@setOnTouchListener false
                        val screenW = resources.displayMetrics.widthPixels
                        val screenH = resources.displayMetrics.heightPixels
                        val density = resources.displayMetrics.density

                        p.gravity = Gravity.TOP or Gravity.START
                        val diskW = view.width.takeIf { it > 0 } ?: (42 * density).toInt()
                        val diskH = view.height.takeIf { it > 0 } ?: (42 * density).toInt()

                        p.x = (diskInitialScreenX + dx.toInt()).coerceIn(0, screenW - diskW)
                        p.y = (diskInitialScreenY + dy.toInt()).coerceIn(0, screenH - diskH)
                        lastTargetY = p.y
                        try { wm.updateViewLayout(view, p) } catch (e: Exception) {}

                        // ── Intersection Math with Bottom Center Drop Zone ──
                        val ringCenterX = p.x + (diskW / 2f)
                        val ringCenterY = p.y + (diskH / 2f)

                        val dropZoneCenterX = screenW / 2f
                        val dropZoneCenterY = screenH - (40 * density) - (21 * density) - (30 * density)
                        val dropThresholdRadius = 75 * density

                        val distance = Math.hypot(
                            (ringCenterX - dropZoneCenterX).toDouble(),
                            (ringCenterY - dropZoneCenterY).toDouble()
                        )

                        updateDropZoneHoverState(distance <= dropThresholdRadius)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (isDiskDrag) {
                        val shouldDisable = isHoveringDropZone
                        hideDropZone()
                        if (shouldDisable) {
                            disableCopilot()
                        } else {
                            snapToNearestEdge(ev.rawX)
                        }
                    } else {
                        hideDropZone()
                        expandToToolbar()
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    hideDropZone()
                    if (isDiskDrag) {
                        snapToNearestEdge(ev.rawX)
                    }
                    true
                }
                else -> false
            }
        }

        // ── 2. Full Draggability for the Toolbar Background ──
        var tbDownX = 0f
        var tbDownY = 0f
        var tbInitialScreenX = 0
        var tbInitialScreenY = 0
        var isTbDrag = false

        toolbarContainer?.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    overlayParams ?: return@setOnTouchListener false
                    tbDownX = ev.rawX
                    tbDownY = ev.rawY

                    val loc = IntArray(2)
                    view.getLocationOnScreen(loc)
                    tbInitialScreenX = loc[0]
                    tbInitialScreenY = loc[1]

                    isTbDrag = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - tbDownX
                    val dy = ev.rawY - tbDownY
                    if (Math.hypot(dx.toDouble(), dy.toDouble()) > 10.0) {
                        isTbDrag = true
                        val p = overlayParams ?: return@setOnTouchListener false
                        val screenW = resources.displayMetrics.widthPixels
                        val screenH = resources.displayMetrics.heightPixels

                        p.gravity = Gravity.TOP or Gravity.START
                        val tbW = view.width.takeIf { it > 0 } ?: (screenW * 0.72f).toInt()
                        val tbH = view.height.takeIf { it > 0 } ?: 100

                        p.x = (tbInitialScreenX + dx.toInt()).coerceIn(0, screenW - tbW)
                        p.y = (tbInitialScreenY + dy.toInt()).coerceIn(0, screenH - tbH)
                        lastTargetY = p.y
                        try { wm.updateViewLayout(view, p) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (isTbDrag) {
                        snapToNearestEdge(ev.rawX)
                    }
                    true
                }
                else -> false
            }
        }

        // ── 3. Collapse Handle ──
        collapseHandle?.setOnClickListener {
            collapseToDisk()
        }

        // ── Action Buttons ──
        view.findViewById<View>(R.id.btn_improve)?.setOnClickListener {
            val draft = ChatAccessibilityService.instance?.readInputFieldText()
            IndicContextModule.instance?.emitActionTriggered("improve", draft)
        }
        view.findViewById<View>(R.id.btn_factcheck)?.setOnClickListener {
            val draft = ChatAccessibilityService.instance?.readInputFieldText()
            IndicContextModule.instance?.emitActionTriggered("factcheck", draft)
        }
        view.findViewById<View>(R.id.btn_icebreaker)?.setOnClickListener {
            val draft = ChatAccessibilityService.instance?.readInputFieldText()
            IndicContextModule.instance?.emitActionTriggered("icebreaker", draft)
        }

        // ── 4. Touch & Glide Language Selector with Caret ──
        setupGlideLanguageSelector(view)

        return view
    }

    /**
     * Component 3: Glide-Select Language Menu on Mic button
     * - Absolute Y positioning to avoid displacing toolbar.
     * - Downward pointing Caret triangle aligned to Mic button.
     */
    private fun setupGlideLanguageSelector(rootView: View) {
        val btnMic = rootView.findViewById<View>(R.id.btn_mic) ?: return
        val popupWrapper = rootView.findViewById<LinearLayout>(R.id.language_popup_wrapper)
        val langBadge = rootView.findViewById<TextView>(R.id.txt_lang_badge)

        val langPills = listOf(
            rootView.findViewById<TextView>(R.id.lang_item_en),
            rootView.findViewById<TextView>(R.id.lang_item_hi),
            rootView.findViewById<TextView>(R.id.lang_item_mr),
            rootView.findViewById<TextView>(R.id.lang_item_bn),
            rootView.findViewById<TextView>(R.id.lang_item_te),
            rootView.findViewById<TextView>(R.id.lang_item_ta),
            rootView.findViewById<TextView>(R.id.lang_item_ml),
        )

        var isLongPressActive = false
        var longPressRunnable: Runnable? = null
        var currentlyHoveredPill: TextView? = null
        var originalOverlayY = 0

        btnMic.setOnTouchListener { v, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    isLongPressActive = false
                    currentlyHoveredPill = null

                    val r = Runnable {
                        isLongPressActive = true
                        v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)

                        val density = resources.displayMetrics.density
                        popupWrapper?.bringToFront()
                        popupWrapper?.elevation = 32 * density

                        // Position Caret & Menu directly over Mic icon
                        val micLoc = IntArray(2)
                        btnMic.getLocationOnScreen(micLoc)
                        val menuWidth = (200 * density).toInt()

                        // Calculate horizontal alignment so caret is centered above Mic
                        val micCenterX = micLoc[0] + (btnMic.width / 2)
                        val screenW = resources.displayMetrics.widthPixels
                        val menuX = (micCenterX - (menuWidth / 2)).coerceIn(
                            (8 * density).toInt(),
                            screenW - menuWidth - (8 * density).toInt()
                        )

                        val rootLoc = IntArray(2)
                        rootView.getLocationOnScreen(rootLoc)
                        popupWrapper?.x = (menuX - rootLoc[0]).toFloat()

                        val caret = rootView.findViewById<View>(R.id.menu_caret)
                        val caretW = (14 * density).toInt()
                        val caretXInPopup = (micCenterX - menuX - (caretW / 2f)).coerceIn(
                            (12 * density),
                            (menuWidth - (12 * density) - caretW).toFloat()
                        )
                        caret?.translationX = caretXInPopup

                        // Compensate WindowManager Y so toolbar DOES NOT SHIFT DOWN
                        val wm = windowManager
                        val p = overlayParams
                        if (wm != null && p != null) {
                            originalOverlayY = p.y
                            popupWrapper?.measure(
                                View.MeasureSpec.makeMeasureSpec(menuWidth, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                            )
                            val popupH = (popupWrapper?.measuredHeight ?: (220 * density).toInt()) + (8 * density).toInt()

                            // Shift window up by popup height + gap so toolbar stays rigidly fixed!
                            p.y = (p.y - popupH).coerceAtLeast(0)
                            try { wm.updateViewLayout(rootView, p) } catch (e: Exception) {}
                        }

                        popupWrapper?.visibility = View.VISIBLE
                        popupWrapper?.alpha = 0f
                        popupWrapper?.scaleY = 0.8f
                        popupWrapper?.pivotY = (popupWrapper?.measuredHeight?.toFloat() ?: (220 * density))
                        popupWrapper?.animate()?.alpha(1f)?.scaleY(1f)?.setDuration(160)?.start()
                    }
                    longPressRunnable = r
                    mainHandler.postDelayed(r, 300L)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (isLongPressActive) {
                        val rawX = ev.rawX
                        val rawY = ev.rawY

                        var hovered: TextView? = null
                        val loc = IntArray(2)

                        for (pill in langPills) {
                            if (pill == null) continue
                            pill.getLocationOnScreen(loc)
                            val left = loc[0]
                            val top = loc[1]
                            val right = left + pill.width
                            val bottom = top + pill.height

                            if (rawX in (left.toFloat() - 35)..(right.toFloat() + 35) &&
                                rawY in (top.toFloat() - 4)..(bottom.toFloat() + 4)) {
                                hovered = pill
                                break
                            }
                        }

                        if (hovered != currentlyHoveredPill) {
                            currentlyHoveredPill = hovered
                            for (pill in langPills) {
                                if (pill == null) continue
                                if (pill == hovered) {
                                    pill.setBackgroundResource(R.drawable.language_pill_selected_bg)
                                    pill.animate().scaleX(1.06f).scaleY(1.06f).setDuration(80).start()
                                    pill.setTypeface(null, Typeface.BOLD)
                                    pill.setTextColor(Color.parseColor("#00E5FF"))
                                } else {
                                    pill.setBackgroundResource(R.drawable.language_pill_bg)
                                    pill.animate().scaleX(1.0f).scaleY(1.0f).setDuration(80).start()
                                    pill.setTypeface(null, Typeface.NORMAL)
                                    pill.setTextColor(Color.parseColor("#FAFAFA"))
                                }
                            }
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    longPressRunnable?.let { mainHandler.removeCallbacks(it) }
                    longPressRunnable = null

                    if (isLongPressActive) {
                        currentlyHoveredPill?.let { selectedPill ->
                            val tag = selectedPill.tag as? String // e.g. "mr-IN:MR"
                            if (tag != null) {
                                val parts = tag.split(":")
                                val code = parts[0]
                                val badge = parts[1]

                                activeLanguageCode = code
                                activeLanguageBadge = badge
                                GnaniSttClient.currentLanguage = code
                                langBadge?.text = badge

                                getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                                    .edit()
                                    .putString("gnani_language", code)
                                    .apply()

                                Toast.makeText(applicationContext, "🗣️ Selected: ${selectedPill.text}", Toast.LENGTH_SHORT).show()
                            }
                        }

                        // Restore original WindowManager Y to avoid drift
                        popupWrapper?.animate()?.alpha(0f)?.setDuration(120)?.withEndAction {
                            popupWrapper.visibility = View.GONE
                            val wm = windowManager
                            val p = overlayParams
                            if (wm != null && p != null && originalOverlayY > 0) {
                                p.y = originalOverlayY
                                try { wm.updateViewLayout(rootView, p) } catch (e: Exception) {}
                            }
                        }?.start()

                        isLongPressActive = false
                        currentlyHoveredPill = null
                    } else {
                        // Quick Tap: Toggle voice recording!
                        toggleVoiceRecording()
                    }
                    true
                }
                else -> false
            }
        }
    }

    // ── Voice Recording & STT ─────────────────────────────────────────

    fun isVoiceRecording(): Boolean = ::voiceRecorder.isInitialized && voiceRecorder.isRecording()

    fun toggleVoiceRecording() {
        mainHandler.post {
            if (!::voiceRecorder.isInitialized) {
                voiceRecorder = VoiceRecorder(applicationContext)
            }

            if (voiceRecorder.isRecording()) {
                val audioFile = voiceRecorder.stop()
                IndicContextModule.instance?.emitRecordingStateChanged(false)

                if (audioFile == null || audioFile.length() < 1000L) {
                    updateMicUi(isRecording = false, isTranscribing = false)
                    Toast.makeText(applicationContext, "Audio was too short.", Toast.LENGTH_SHORT).show()
                    return@post
                }

                updateMicUi(isRecording = false, isTranscribing = true)
                Toast.makeText(applicationContext, "⏳ Transcribing ($activeLanguageBadge)...", Toast.LENGTH_SHORT).show()

                GnaniSttClient.transcribe(audioFile, activeLanguageCode) { result ->
                    mainHandler.post {
                        updateMicUi(isRecording = false, isTranscribing = false)
                        result.onSuccess { transcript ->
                            if (transcript.isNotEmpty()) {
                                val injected = ChatAccessibilityService.instance?.injectText(transcript) ?: false
                                if (injected) {
                                    Toast.makeText(applicationContext, "✨ Injected: $transcript", Toast.LENGTH_SHORT).show()
                                } else {
                                    copyToClipboard(transcript)
                                    Toast.makeText(applicationContext, "📋 Copied: $transcript", Toast.LENGTH_SHORT).show()
                                }
                                IndicContextModule.instance?.emitVoiceTranscript(transcript, true)
                            } else {
                                Toast.makeText(applicationContext, "No speech recognized.", Toast.LENGTH_SHORT).show()
                                IndicContextModule.instance?.emitVoiceTranscript("", false)
                            }
                        }.onFailure { err ->
                            Log.e(TAG, "Gnani STT error: ${err.message}", err)
                            Toast.makeText(applicationContext, "STT Failed: ${err.message}", Toast.LENGTH_LONG).show()
                            IndicContextModule.instance?.emitVoiceTranscript("", false)
                        }
                    }
                }
            } else {
                val hasMicPermission = ContextCompat.checkSelfPermission(
                    applicationContext,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED

                if (!hasMicPermission) {
                    Toast.makeText(
                        applicationContext,
                        "Microphone permission not granted. Please allow in app settings.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@post
                }

                try {
                    voiceRecorder.start()
                    updateMicUi(isRecording = true, isTranscribing = false)
                    IndicContextModule.instance?.emitRecordingStateChanged(true)
                    Toast.makeText(applicationContext, "🎙️ Listening ($activeLanguageBadge)... Tap mic to send", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start VoiceRecorder: ${e.message}", e)
                    updateMicUi(isRecording = false, isTranscribing = false)
                    Toast.makeText(applicationContext, "Failed to start microphone: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun updateMicUi(isRecording: Boolean, isTranscribing: Boolean) {
        this.isTranscribing = isTranscribing

        overlayRootView?.let { root ->
            val micContainer = root.findViewById<View>(R.id.btn_mic)
            val micIconText = root.findViewById<TextView>(R.id.mic_icon_text)

            when {
                isRecording -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_mic_recording)
                    micIconText?.text = "🔴"
                    micContainer?.alpha = 1.0f
                }
                isTranscribing -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_glass)
                    micIconText?.text = "..."
                    micContainer?.alpha = 0.5f
                }
                else -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_glass)
                    micIconText?.text = "🎙️"
                    micContainer?.alpha = 1.0f
                }
            }
        }
    }

    private fun updateBadge(count: Int) {
        // Message buffer tracking remains internal; no visible badge displayed on UI.
    }

    private fun copyToClipboard(text: String) {
        try {
            val clip = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clip.setPrimaryClip(ClipData.newPlainText("gnani_stt", text))
        } catch (e: Exception) {
            Log.w(TAG, "copyToClipboard failed: ${e.message}")
        }
    }

    // ── WindowManager Layout Params ───────────────────────────────────

    private fun buildOverlayParams(yPos: Int, expanded: Boolean): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            if (currentEdge == Edge.RIGHT) {
                gravity = Gravity.TOP or Gravity.END
                x = 0
            } else {
                gravity = Gravity.TOP or Gravity.START
                x = 0
            }
            y = yPos
        }
    }

    // ── Foreground Notification ───────────────────────────────────────

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
            .setContentText("Active in WhatsApp.")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi)
            .setOngoing(true)
            .build()
    }
}
