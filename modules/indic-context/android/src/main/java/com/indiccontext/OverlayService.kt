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
 *    - On release, calculates X and snaps to left or right screen edge.
 *    - Persists edge state ('left' | 'right').
 *
 * 2. Dynamic Layout Reversal:
 *    - If on LEFT: Action buttons on left, collapse button on far right pointing left (<).
 *    - If on RIGHT: Collapse button on far left pointing right (>), action buttons on right.
 *
 * 3. Zero Layout Shift for Mic Language Popup + Downward Caret:
 *    - WindowManager height and Y coordinate compensated so toolbar NEVER shifts.
 *    - Rotated caret points directly at center of Mic button.
 *
 * 4. Dark Glassmorphism Styling:
 *    - Deep translucent charcoal (rgba(30, 30, 32, 0.85)) with thin border (rgba(255, 255, 255, 0.1)).
 *    - Soft crisp white (#FAFAFA) icons.
 *    - Soft Neon Cyan (#00E5FF) active & glide highlights.
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
    private var pendingHideRunnable: Runnable? = null
    private val HIDE_DEBOUNCE_MS = 180L

    // ── Language State ──
    private var activeLanguageCode = "en-IN"
    private var activeLanguageBadge = "EN"

    // ── Voice Recorder ──
    private lateinit var voiceRecorder: VoiceRecorder
    private var isTranscribing = false

    // ── Badge Counter ──
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
            // Cancel any pending hide action so transient focus fluctuations don't flicker/destroy window
            pendingHideRunnable?.let { mainHandler.removeCallbacks(it) }
            pendingHideRunnable = null

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

    fun hideOverlay(immediate: Boolean = false) {
        mainHandler.post {
            pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
            pendingPositionUpdate = null

            if (!immediate) {
                if (pendingHideRunnable != null) return@post
                val r = Runnable { performHideOverlay() }
                pendingHideRunnable = r
                mainHandler.postDelayed(r, HIDE_DEBOUNCE_MS)
            } else {
                pendingHideRunnable?.let { mainHandler.removeCallbacks(it) }
                pendingHideRunnable = null
                performHideOverlay()
            }
        }
    }

    private fun performHideOverlay() {
        pendingHideRunnable = null
        val view = overlayRootView ?: return
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

    fun hideToolbar() = hideOverlay()
    fun hideEdgePill() = hideOverlay()
    fun isToolbarShowing(): Boolean = isOverlayShowing

    // ── Dynamic Edge Layout Reversal ──────────────────────────────────

    private fun applyEdgeLayout(edge: Edge) {
        val root = overlayRootView ?: return
        val toolbar = root.findViewById<LinearLayout>(R.id.toolbar_container) ?: return
        val collapseBtn = root.findViewById<FrameLayout>(R.id.btn_collapse_handle) ?: return
        val collapseArrow = root.findViewById<TextView>(R.id.collapse_arrow) ?: return
        val divider = root.findViewById<View>(R.id.toolbar_divider) ?: return
        val actionButtons = root.findViewById<LinearLayout>(R.id.action_buttons_container) ?: return

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
        } else {
            // RIGHT edge: Collapse button on far left (>) -> divider -> action buttons on right
            toolbar.addView(collapseBtn)
            toolbar.addView(divider)
            toolbar.addView(actionButtons)
            collapseArrow.text = "›"
            collapseBtn.setBackgroundResource(R.drawable.btn_collapse_bg_left)
        }
    }

    // ── Expand & Collapse Transitions ─────────────────────────────────

    private fun expandToToolbar() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density
        val margin = (8 * density).toInt()

        isExpanded = true
        val toolbarW = (screenW * 0.72f).toInt()
        params.width = toolbarW

        // Edge coordinate calculation
        if (currentEdge == Edge.RIGHT) {
            params.x = screenW - toolbarW - margin
        } else {
            params.x = margin
        }

        val disk = view.findViewById<View>(R.id.disk_container)
        val toolbar = view.findViewById<View>(R.id.toolbar_container)

        applyEdgeLayout(currentEdge)

        disk?.visibility = View.GONE
        toolbar?.visibility = View.VISIBLE
        toolbar?.alpha = 0f
        toolbar?.scaleX = 0.4f
        toolbar?.pivotX = if (currentEdge == Edge.LEFT) 0f else toolbarW.toFloat()
        toolbar?.animate()?.alpha(1f)?.scaleX(1f)?.setDuration(220)?.start()

        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
        Log.d(TAG, "Expanded into 72% toolbar at $currentEdge edge.")
    }

    private fun collapseToDisk() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density
        val margin = (8 * density).toInt()
        val diskW = (42 * density).toInt()

        isExpanded = false
        params.width = WindowManager.LayoutParams.WRAP_CONTENT

        if (currentEdge == Edge.RIGHT) {
            params.x = screenW - diskW - margin
        } else {
            params.x = margin
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
        Log.d(TAG, "Collapsed back into circular disk at $currentEdge edge.")
    }

    // ── Edge Snapping Animation ──

    private fun snapToNearestEdge(releaseRawX: Float) {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density
        val margin = (8 * density).toInt()

        val newEdge = if (releaseRawX < screenW / 2) Edge.LEFT else Edge.RIGHT
        currentEdge = newEdge

        // Persist edge choice
        getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("overlay_edge", if (newEdge == Edge.LEFT) "left" else "right")
            .apply()

        applyEdgeLayout(newEdge)

        val targetWidth = if (isExpanded) (screenW * 0.72f).toInt() else (42 * density).toInt()
        val startX = params.x
        val endX = if (newEdge == Edge.LEFT) margin else (screenW - targetWidth - margin)

        val animator = ValueAnimator.ofInt(startX, endX).apply {
            duration = 180L
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                params.x = anim.animatedValue as Int
                try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
            }
        }
        animator.start()
    }

    private fun bindQuickActionButton(view: View?, onClickAction: () -> Unit) {
        if (view == null) return
        var touchDownX = 0f
        var touchDownY = 0f
        var initialParamX = 0
        var initialParamY = 0
        var isDrag = false

        view.setOnTouchListener { v, ev ->
            val p = overlayParams
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    touchDownX = ev.rawX
                    touchDownY = ev.rawY
                    if (p != null) {
                        initialParamX = p.x
                        initialParamY = p.y
                    }
                    isDrag = false
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    v.animate().scaleX(0.88f).scaleY(0.88f).setDuration(40).start()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - touchDownX
                    val dy = ev.rawY - touchDownY
                    if (Math.hypot(dx.toDouble(), dy.toDouble()) > 15.0) {
                        if (!isDrag) {
                            isDrag = true
                            v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(40).start()
                        }
                        if (p != null) {
                            val wm = windowManager
                            val root = overlayRootView
                            p.x = initialParamX + dx.toInt()
                            val screenH = resources.displayMetrics.heightPixels
                            p.y = (initialParamY + dy.toInt()).coerceIn(0, screenH - 100)
                            lastTargetY = p.y
                            if (wm != null && root != null) {
                                try { wm.updateViewLayout(root, p) } catch (e: Exception) {}
                            }
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(40).start()
                    if (isDrag) {
                        snapToNearestEdge(ev.rawX)
                    } else {
                        onClickAction()
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(40).start()
                    true
                }
                else -> false
            }
        }
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

        // ── 1. Circular Disk (Instant Tap + Drag) ──
        bindQuickActionButton(diskContainer) {
            expandToToolbar()
        }

        // ── 2. Action Buttons (Instant Tap Response) ──
        bindQuickActionButton(view.findViewById<View>(R.id.btn_improve)) {
            Toast.makeText(applicationContext, "✨ Improve Text (Gnani Evon) — coming soon", Toast.LENGTH_SHORT).show()
        }
        bindQuickActionButton(view.findViewById<View>(R.id.btn_factcheck)) {
            Toast.makeText(applicationContext, "🔍 Fact Check — coming soon", Toast.LENGTH_SHORT).show()
        }
        bindQuickActionButton(view.findViewById<View>(R.id.btn_icebreaker)) {
            Toast.makeText(applicationContext, "🧊 Icebreaker — coming soon", Toast.LENGTH_SHORT).show()
        }

        // ── 3. Collapse Handle ──
        bindQuickActionButton(collapseHandle) {
            collapseToDisk()
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

                        // Position Caret & Menu directly over Mic icon
                        val micLoc = IntArray(2)
                        btnMic.getLocationOnScreen(micLoc)
                        val density = resources.displayMetrics.density
                        val menuWidth = (200 * density).toInt()

                        // Calculate horizontal alignment so caret is centered above Mic
                        val micCenterX = micLoc[0] + (btnMic.width / 2)
                        val screenW = resources.displayMetrics.widthPixels
                        val menuX = (micCenterX - (menuWidth / 2)).coerceIn(
                            (8 * density).toInt(),
                            screenW - menuWidth - (8 * density).toInt()
                        )

                        popupWrapper?.x = menuX.toFloat() - (overlayParams?.x ?: 0)

                        // Compensate WindowManager Y so toolbar DOES NOT SHIFT DOWN
                        val wm = windowManager
                        val p = overlayParams
                        if (wm != null && p != null) {
                            originalOverlayY = p.y
                            popupWrapper?.measure(
                                View.MeasureSpec.makeMeasureSpec(menuWidth, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                            )
                            val popupH = popupWrapper?.measuredHeight ?: (280 * density).toInt()

                            // Shift window up by popup height so toolbar stays rigidly fixed!
                            p.y = (p.y - popupH).coerceAtLeast(0)
                            try { wm.updateViewLayout(rootView, p) } catch (e: Exception) {}
                        }

                        popupWrapper?.visibility = View.VISIBLE
                        popupWrapper?.alpha = 0f
                        popupWrapper?.scaleY = 0.8f
                        popupWrapper?.pivotY = popupWrapper.height.toFloat()
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
        val root = overlayRootView ?: return
        val diskBadge = root.findViewById<TextView>(R.id.disk_context_badge)
        val toolbarBadge = root.findViewById<TextView>(R.id.context_badge)

        val text = if (count > 99) "99+" else count.toString()
        val visibility = if (count > 0) View.VISIBLE else View.GONE

        diskBadge?.visibility = visibility
        diskBadge?.text = text
        toolbarBadge?.visibility = visibility
        toolbarBadge?.text = text
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

        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density
        val margin = (8 * density).toInt()

        val width = if (expanded) (screenW * 0.72f).toInt() else WindowManager.LayoutParams.WRAP_CONTENT
        val xPos = if (currentEdge == Edge.LEFT) margin else (screenW - (if (expanded) width else (42 * density).toInt()) - margin)

        return WindowManager.LayoutParams(
            width,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = xPos
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
