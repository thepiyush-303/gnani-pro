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
import android.widget.ImageView
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
    private var pendingHideRunnable: Runnable? = null
    private val HIDE_DEBOUNCE_MS = 180L

    // ── Drop Zone State (Drag to Disable) ──
    private var dropZoneView: View? = null
    private var dropZoneParams: WindowManager.LayoutParams? = null
    private var isHoveringDropZone = false

    // ── Language State ──
    private var activeLanguageCode = "en-IN"
    private var activeLanguageBadge = "EN"

    // ── Voice Recorder ──
    private lateinit var voiceRecorder: VoiceRecorder

    // ── Voice Changer (🗣️ button) ──
    private lateinit var voiceChanger: VoiceChangerController

    // ── Hold-and-glide pickers (🎙️ language, 🗣️ voice) — own overlay window ──
    private val glideMenu: GlideMenu by lazy { GlideMenu(this, windowManager!!) }
    private var recPulse: android.animation.ObjectAnimator? = null
    private var processingPulse: android.animation.ObjectAnimator? = null

    private data class GlideLanguage(val code: String, val badge: String, val name: String, val native: String?)

    private val GLIDE_LANGUAGES = listOf(
        GlideLanguage("en-IN", "EN", "English", null),
        GlideLanguage("hi-IN", "HI", "Hindi", "हिन्दी"),
        GlideLanguage("mr-IN", "MR", "Marathi", "मराठी"),
        GlideLanguage("bn-IN", "BN", "Bangla", "বাংলা"),
        GlideLanguage("te-IN", "TE", "Telugu", "తెలుగు"),
        GlideLanguage("ta-IN", "TA", "Tamil", "தமிழ்"),
        GlideLanguage("ml-IN", "ML", "Malayalam", "മലയാളം"),
        GlideLanguage("gu-IN", "GU", "Gujarati", "ગુજરાતી"),
        GlideLanguage("kn-IN", "KN", "Kannada", "ಕನ್ನಡ"),
        GlideLanguage("pa-IN", "PA", "Punjabi", "ਪੰਜਾਬੀ"),
    )
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
        activeLanguageBadge = GLIDE_LANGUAGES.firstOrNull { it.code == activeLanguageCode }?.badge ?: "EN"
        GnaniSttClient.currentLanguage = activeLanguageCode

        voiceChanger = VoiceChangerController(applicationContext, object : VoiceChangerController.Ui {
            override fun showCard(title: String, subtitle: String?, actions: List<Pair<String, () -> Unit>>) =
                this@OverlayService.showCard(title, subtitle, actions.map { (label, onTap) -> CardChip(label, onTap) })
            override fun hideCard() = hideRecommendations()
            override fun setButtonState(state: VoiceChangerController.ButtonState) = updateVoiceChangerUi(state)
            override fun currentLanguage() = activeLanguageCode to activeLanguageBadge
            override fun isDictationRecording() = isVoiceRecording()
        })
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
        if (::voiceChanger.isInitialized) voiceChanger.release()
        if (::voiceRecorder.isInitialized && voiceRecorder.isRecording()) {
            voiceRecorder.cancel()
        }
        hideOverlay()
        instance = null
        Log.i(TAG, "Destroyed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /** Kept for bridge compatibility. Visibility no longer depends on a mode: the bubble shows inside chat rooms. */
    fun setMode(mode: OverlayMode) {
        currentMode = mode
    }

    // ── Hooks used by ChatAccessibilityService & the JS bridge ─────────

    /** Collapse the toolbar back to the bubble (outside touch, keyboard-back). */
    fun collapseToolbar() {
        mainHandler.post { if (isExpanded && overlayRootView != null) collapseToDisk() }
    }

    /**
     * The user left the chat room (home, status, another app…): drop cards and
     * cancel any in-flight voice work so nothing pops up over another screen.
     */
    fun onLeftChatRoom() {
        mainHandler.post {
            hideRecommendations()
            if (::voiceChanger.isInitialized) voiceChanger.cancelAll()
            if (::voiceRecorder.isInitialized && voiceRecorder.isRecording()) {
                voiceRecorder.cancel()
                updateMicUi(isRecording = false, isTranscribing = false)
                IndicContextModule.instance?.emitRecordingStateChanged(false)
            }
        }
    }

    /** Sets the speech language (toolbar glide menu or dashboard) and refreshes the 🎙 badge. */
    fun applyLanguage(code: String): Boolean {
        val lang = GLIDE_LANGUAGES.firstOrNull { it.code == code } ?: return false
        activeLanguageCode = lang.code
        activeLanguageBadge = lang.badge
        GnaniSttClient.currentLanguage = lang.code
        getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
            .edit().putString("gnani_language", lang.code).apply()
        mainHandler.post { overlayRootView?.findViewById<TextView>(R.id.txt_lang_badge)?.text = lang.badge }
        return true
    }

    /** Re-reads the default voice (changed from the dashboard) into the 🗣 badge. */
    fun refreshVoiceBadge() {
        if (::voiceChanger.isInitialized && voiceChanger.canPickVoice()) {
            updateVoiceChangerUi(voiceChanger.initialButtonState())
        }
    }

    /** Outside touches close the toolbar — but never while a voice note / dictation is in progress. */
    private fun maybeAutoCollapse() {
        if (!isExpanded) return
        val busy = (::voiceChanger.isInitialized && voiceChanger.isBusy()) || isVoiceRecording() || isTranscribing
        if (!busy) collapseToDisk()
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
            val diskH = (52 * density).toInt() // tallest state (toolbar); the 48dp bubble sits at its bottom

            val targetY: Int = if (inputBounds != null && inputBounds.top > diskH + (10 * density).toInt()) {
                (inputBounds.top - diskH - (8 * density).toInt()).coerceIn(0, screenH - diskH)
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
        hideDropZone()
        if (windowManager != null) glideMenu.dismissNow()
        // Animators point at views of the window being removed; recreate on next show
        recPulse?.cancel(); recPulse = null
        processingPulse?.cancel(); processingPulse = null
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

    // ── Smart Reply & Recommendations Floating Card ──
    private var recommendationView: View? = null
    private var recommendationParams: WindowManager.LayoutParams? = null
    private var lastShownChipLabels: List<String> = emptyList()
    private var lastShownTitle: String = ""

    /** A tappable chip on the floating card. */
    private data class CardChip(val label: String, val onTap: () -> Unit)
    private val EXTRA_CHIP_TAG = "extra_chip"

    /** Suggestions card: tapping a chip injects that text into the chat input. */
    fun showRecommendations(title: String, subtitle: String?, suggestions: List<String>) {
        if (suggestions.isEmpty()) return
        showCard(title, subtitle, suggestions.map { text ->
            CardChip(text) {
                val ok = ChatAccessibilityService.instance?.injectText(text) ?: false
                if (ok) {
                    Toast.makeText(applicationContext, "Inserted", Toast.LENGTH_SHORT).show()
                }
                hideRecommendations()
            }
        })
    }

    /**
     * Notice/error card (e.g. LLM unreachable, empty draft). When [retryAction]
     * is set, a single "↻ Retry" chip re-fires that action to JS (same path as
     * tapping the toolbar button) instead of injecting any text.
     */
    fun showAiError(title: String, message: String, retryAction: String?) {
        val chips = if (retryAction.isNullOrBlank()) emptyList() else listOf(
            CardChip("↻ Retry") {
                hideRecommendations()
                val draft = ChatAccessibilityService.instance?.readInputFieldText()
                IndicContextModule.instance?.emitActionTriggered(retryAction, draft)
            }
        )
        showCard(title, message, chips)
    }

    private fun bindCard(view: View, title: String, subtitle: String?, chips: List<CardChip>) {
        view.findViewById<TextView>(R.id.txt_recommendation_title)?.text = title
        view.findViewById<TextView>(R.id.txt_recommendation_subtitle)?.let { txtSub ->
            if (subtitle.isNullOrBlank()) {
                txtSub.visibility = View.GONE
            } else {
                txtSub.text = subtitle
                txtSub.visibility = View.VISIBLE
            }
        }
        val first = view.findViewById<TextView>(R.id.chip_recommendation_1)
        val chipViews = mutableListOf(
            first,
            view.findViewById<TextView>(R.id.chip_recommendation_2),
            view.findViewById<TextView>(R.id.chip_recommendation_3),
        )
        // More than 3 actions (e.g. 5 alternative voices): add extra chips styled like chip 1
        val container = first?.parent as? ViewGroup
        container?.let { c ->
            for (i in (c.childCount - 1) downTo 0) {
                if (c.getChildAt(i).tag == EXTRA_CHIP_TAG) c.removeViewAt(i)
            }
        }
        if (first != null && container != null) {
            for (i in chipViews.size until chips.size) {
                val extra = TextView(this).apply {
                    tag = EXTRA_CHIP_TAG
                    layoutParams = first.layoutParams
                    minHeight = first.minHeight
                    gravity = first.gravity
                    setPadding(first.paddingLeft, first.paddingTop, first.paddingRight, first.paddingBottom)
                    setTextColor(first.currentTextColor)
                    setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, first.textSize)
                    setBackgroundResource(R.drawable.language_pill_bg)
                    isClickable = true
                }
                container.addView(extra, container.indexOfChild(chipViews.last()) + 1)
                chipViews.add(extra)
            }
        }
        chipViews.forEach { it?.visibility = View.GONE }
        for (i in 0 until minOf(chips.size, chipViews.size)) {
            val chipView = chipViews[i] ?: continue
            val chip = chips[i]
            chipView.text = chip.label
            chipView.visibility = View.VISIBLE
            chipView.setOnClickListener { chip.onTap() }
        }
    }

    private fun showCard(title: String, subtitle: String?, chips: List<CardChip>) {
        mainHandler.post {
            val wm = windowManager ?: return@post
            val labels = chips.map { it.label }

            // If the identical card is already displayed, avoid rebuilding it
            if (recommendationView != null && lastShownChipLabels == labels && lastShownTitle == title) {
                return@post
            }
            lastShownChipLabels = labels
            lastShownTitle = title

            val existingView = recommendationView
            if (existingView != null) {
                // Update in place to prevent flicker
                bindCard(existingView, title, subtitle, chips)
                return@post
            }

            val view = LayoutInflater.from(this).inflate(R.layout.overlay_recommendations, null)
            bindCard(view, title, subtitle, chips)
            view.findViewById<View>(R.id.btn_close_recommendations)?.setOnClickListener {
                hideRecommendations()
            }

            val density = resources.displayMetrics.density
            val screenW = resources.displayMetrics.widthPixels
            val screenH = resources.displayMetrics.heightPixels
            val cardWidth = (290 * density).toInt()

            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

            val p = WindowManager.LayoutParams(
                cardWidth,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                val currentY = overlayParams?.y ?: (screenH / 2)
                y = (currentY - (175 * density).toInt()).coerceIn((40 * density).toInt(), screenH - (250 * density).toInt())
                x = if (currentEdge == Edge.RIGHT) {
                    (screenW - cardWidth - (12 * density).toInt()).coerceAtLeast(0)
                } else {
                    (12 * density).toInt()
                }
            }

            recommendationView = view
            recommendationParams = p

            try {
                wm.addView(view, p)
                view.alpha = 0f
                view.scaleY = 0.95f
                view.animate().alpha(1f).scaleY(1f).setDuration(160).start()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show recommendation view: ${e.message}")
            }
        }
    }

    fun hideRecommendations() {
        mainHandler.post {
            lastShownChipLabels = emptyList()
            lastShownTitle = ""
            val wm = windowManager ?: return@post
            val view = recommendationView ?: return@post
            try {
                view.animate().alpha(0f).scaleY(0.95f).setDuration(100).withEndAction {
                    try {
                        wm.removeView(view)
                    } catch (e: Exception) {}
                    if (recommendationView === view) {
                        recommendationView = null
                        recommendationParams = null
                    }
                }.start()
            } catch (e: Exception) {
                try { wm.removeView(view) } catch (ignore: Exception) {}
                recommendationView = null
                recommendationParams = null
            }
        }
    }

    // ── Dynamic Edge Layout Reversal & Flush Bezel Fit ─────────────────

    private fun applyEdgeLayout(edge: Edge) {
        val root = overlayRootView ?: return
        val toolbar = root.findViewById<LinearLayout>(R.id.toolbar_container) ?: return
        val collapseBtn = root.findViewById<FrameLayout>(R.id.btn_collapse_handle) ?: return
        val collapseArrow = root.findViewById<ImageView>(R.id.collapse_arrow) ?: return
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

            collapseArrow.setImageResource(R.drawable.ic_chevron_left)
            collapseBtn.setBackgroundResource(R.drawable.btn_bg_toolbar)
            collapseBtn.setPadding(0, 0, 0, 0)
            (collapseBtn.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.marginStart = (2 * density).toInt()
                lp.marginEnd = 0
                collapseBtn.layoutParams = lp
            }

            // Fully visible 24dp rounded left corners (no negative margins or offscreen shifts)
            toolbar.setBackgroundResource(R.drawable.overlay_bg)
            toolbar.setPadding((6 * density).toInt(), 0, (6 * density).toInt(), 0)

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

            collapseArrow.setImageResource(R.drawable.ic_chevron_right)
            collapseBtn.setBackgroundResource(R.drawable.btn_bg_toolbar)
            collapseBtn.setPadding(0, 0, 0, 0)
            (collapseBtn.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.marginStart = 0
                lp.marginEnd = (2 * density).toInt()
                collapseBtn.layoutParams = lp
            }

            // Fully visible 24dp rounded corners, anchored directly to right bounds
            toolbar.setBackgroundResource(R.drawable.overlay_bg)
            toolbar.setPadding((6 * density).toInt(), 0, (6 * density).toInt(), 0)

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
        glideMenu.dismissNow()
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

        // ── 0. Any touch outside the overlay (chat, keyboard, other windows) closes the toolbar ──
        view.setOnTouchListener { _, ev ->
            if (ev.actionMasked == MotionEvent.ACTION_OUTSIDE) {
                maybeAutoCollapse()
                true
            } else {
                false
            }
        }

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
                    diskContainer.animate().scaleX(0.92f).scaleY(0.92f).setDuration(70).start()
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
                    diskContainer.animate().scaleX(1f).scaleY(1f).setDuration(90).start()
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
                    diskContainer.animate().scaleX(1f).scaleY(1f).setDuration(90).start()
                    hideDropZone()
                    if (isDiskDrag) {
                        snapToNearestEdge(ev.rawX)
                    }
                    true
                }
                else -> false
            }
        }

        // ── 2. Action Buttons (Instant Tap Response & Bridge Triggers) ──
        bindQuickActionButton(view.findViewById<View>(R.id.btn_improve)) {
            val draft = ChatAccessibilityService.instance?.readInputFieldText()
            IndicContextModule.instance?.emitActionTriggered("improve", draft)
        }
        bindQuickActionButton(view.findViewById<View>(R.id.btn_smart_replies)) {
            val draft = ChatAccessibilityService.instance?.readInputFieldText()
            IndicContextModule.instance?.emitActionTriggered("smart_replies", draft)
        }

        // ── 3. Full Draggability for the Toolbar Background ──
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

        // ── 4. Collapse Handle ──
        bindQuickActionButton(collapseHandle) {
            collapseToDisk()
        }

        // ── 5. Touch & Glide Language Selector with Caret ──
        setupGlideButtons(view)

        return view
    }

    /**
     * Hold-and-glide pickers. Long-press opens a [GlideMenu] in its own overlay
     * window above the button; gliding highlights a row; releasing picks it.
     * A short tap runs the button's normal action.
     *  - 🎙️ mic: speech language (tap = dictation)
     *  - 🗣️ voice changer: Timbre voice (tap = record / stop)
     */
    private fun setupGlideButtons(rootView: View) {
        val btnMic = rootView.findViewById<View>(R.id.btn_mic)
        val langBadge = rootView.findViewById<TextView>(R.id.txt_lang_badge)
        langBadge?.text = activeLanguageBadge

        bindGlideButton(
            btnMic,
            onTap = { toggleVoiceRecording() },
            canOpen = { !isVoiceRecording() && !isTranscribing },
            open = { anchor ->
                glideMenu.show(
                    anchor, "HOLD & GLIDE · SPEECH LANGUAGE",
                    GLIDE_LANGUAGES.map { GlideMenu.Item(it.code, it.name, listOfNotNull(it.native, it.badge).joinToString(" · ")) },
                    activeLanguageCode,
                )
            },
            onPick = { item ->
                val lang = GLIDE_LANGUAGES.firstOrNull { it.code == item.key } ?: return@bindGlideButton
                applyLanguage(lang.code)
                Toast.makeText(applicationContext, "🎙️ Language: ${lang.name}", Toast.LENGTH_SHORT).show()
            },
        )

        val btnVoice = rootView.findViewById<View>(R.id.btn_voice_changer)
        bindGlideButton(
            btnVoice,
            onTap = { voiceChanger.onButtonTap() },
            canOpen = { voiceChanger.canPickVoice() },
            open = { anchor ->
                glideMenu.show(anchor, "HOLD & GLIDE · VOICE", voiceChanger.glideItems(), voiceChanger.selectedVoice().id)
            },
            onPick = { item -> voiceChanger.selectVoice(item.key) },
        )
        updateVoiceChangerUi(voiceChanger.initialButtonState())
    }

    private fun bindGlideButton(
        button: View?,
        onTap: () -> Unit,
        canOpen: () -> Boolean,
        open: (View) -> Unit,
        onPick: (GlideMenu.Item) -> Unit,
    ) {
        if (button == null) return
        var menuOpen = false
        var longPress: Runnable? = null

        button.setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    menuOpen = false
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    v.animate().scaleX(0.9f).scaleY(0.9f).setDuration(50).start()
                    if (canOpen()) {
                        val r = Runnable {
                            menuOpen = true
                            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            v.animate().scaleX(1f).scaleY(1f).setDuration(60).start()
                            open(v)
                        }
                        longPress = r
                        mainHandler.postDelayed(r, 320L)
                    }
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (menuOpen) glideMenu.hover(ev.rawX, ev.rawY)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    longPress?.let { mainHandler.removeCallbacks(it) }
                    longPress = null
                    v.animate().scaleX(1f).scaleY(1f).setDuration(60).start()
                    if (menuOpen) {
                        menuOpen = false
                        glideMenu.dismiss()?.let(onPick)
                    } else {
                        onTap()
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    longPress?.let { mainHandler.removeCallbacks(it) }
                    longPress = null
                    v.animate().scaleX(1f).scaleY(1f).setDuration(60).start()
                    if (menuOpen) {
                        menuOpen = false
                        glideMenu.dismiss()
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
                if (::voiceChanger.isInitialized && voiceChanger.isRecording()) {
                    Toast.makeText(applicationContext, "Stop the 🗣️ voice recording first.", Toast.LENGTH_SHORT).show()
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
            val micIcon = root.findViewById<ImageView>(R.id.mic_icon)

            when {
                isRecording -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_mic_recording)
                    micIcon?.setImageResource(R.drawable.ic_stop)
                    micContainer?.alpha = 1.0f
                }
                isTranscribing -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_processing)
                    micIcon?.setImageResource(R.drawable.ic_hourglass)
                    micContainer?.alpha = 0.8f
                }
                else -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_toolbar)
                    micIcon?.setImageResource(R.drawable.ic_mic)
                    micContainer?.alpha = 1.0f
                }
            }
        }
    }

    /** Idle: 🗣️ + voice badge · Recording: red pill with pulsing dot + m:ss · Processing: pulsing violet. */
    private fun updateVoiceChangerUi(state: VoiceChangerController.ButtonState) {
        mainHandler.post {
            val root = overlayRootView ?: return@post
            val btn = root.findViewById<View>(R.id.btn_voice_changer) ?: return@post
            val icon = root.findViewById<ImageView>(R.id.voice_changer_icon)
            val badge = root.findViewById<TextView>(R.id.txt_voice_badge)
            val recState = root.findViewById<View>(R.id.voice_rec_state)
            val dot = root.findViewById<View>(R.id.voice_rec_dot)
            val timer = root.findViewById<TextView>(R.id.voice_rec_timer)
            val density = resources.displayMetrics.density

            fun setWidth(dp: Int) {
                val lp = btn.layoutParams
                val px = (dp * density).toInt()
                if (lp.width != px) { lp.width = px; btn.layoutParams = lp }
            }

            when (state) {
                is VoiceChangerController.ButtonState.Recording -> {
                    processingPulse?.cancel(); processingPulse = null; btn.alpha = 1f
                    setWidth(80)
                    btn.setBackgroundResource(R.drawable.btn_bg_rec_pill)
                    icon?.visibility = View.GONE
                    badge?.visibility = View.GONE
                    recState?.visibility = View.VISIBLE
                    val secs = state.elapsedMs / 1000
                    timer?.text = String.format(java.util.Locale.US, "%d:%02d", secs / 60, secs % 60)
                    if (recPulse == null && dot != null) {
                        recPulse = android.animation.ObjectAnimator.ofFloat(dot, View.ALPHA, 1f, 0.25f).apply {
                            duration = 550
                            repeatMode = android.animation.ValueAnimator.REVERSE
                            repeatCount = android.animation.ValueAnimator.INFINITE
                            start()
                        }
                    }
                }
                is VoiceChangerController.ButtonState.Processing -> {
                    recPulse?.cancel(); recPulse = null
                    setWidth(40)
                    btn.setBackgroundResource(R.drawable.btn_bg_processing)
                    recState?.visibility = View.GONE
                    icon?.visibility = View.VISIBLE
                    icon?.setImageResource(R.drawable.ic_hourglass)
                    badge?.visibility = View.VISIBLE
                    if (processingPulse == null) {
                        processingPulse = android.animation.ObjectAnimator.ofFloat(btn, View.ALPHA, 1f, 0.45f).apply {
                            duration = 650
                            repeatMode = android.animation.ValueAnimator.REVERSE
                            repeatCount = android.animation.ValueAnimator.INFINITE
                            start()
                        }
                    }
                }
                is VoiceChangerController.ButtonState.Idle -> {
                    recPulse?.cancel(); recPulse = null
                    processingPulse?.cancel(); processingPulse = null
                    btn.alpha = 1f
                    dot?.alpha = 1f
                    setWidth(40)
                    btn.setBackgroundResource(R.drawable.btn_bg_toolbar)
                    recState?.visibility = View.GONE
                    icon?.visibility = View.VISIBLE
                    icon?.setImageResource(R.drawable.ic_voice_changer)
                    badge?.visibility = View.VISIBLE
                    badge?.text = state.voiceBadge
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
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
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
            .setSmallIcon(R.drawable.ic_notification)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi)
            .setOngoing(true)
            .build()
    }
}
