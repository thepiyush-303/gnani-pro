package com.indiccontext

import android.Manifest
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
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat

/**
 * OverlayService — Part 1 UI Structure & Behavior Implementation
 *
 * 1. The Collapsed State (The Disk):
 *    - A 42x42dp circular ring pill docked to the screen edge flush above keyboard.
 *    - Vibrant indigo-to-purple gradient.
 *    - Tapping expands horizontally into the compact toolbar.
 *
 * 2. The Expanded State (The Toolbar):
 *    - Compact horizontal pill (70-75% screen width).
 *    - 4 action buttons: Improve Text (✨), Fact Check (🔍), Icebreaker (🧊), Voice (🎙️).
 *    - Outer edge contains a distinct rectangular section with collapse handle (<).
 *    - Tapping the collapse handle shrinks the toolbar back to the circular disk.
 *
 * 3. The Glide-Select Language Menu (Mic Button):
 *    - Regular tap: starts/stops dictation in the active language.
 *    - Long press / drag: pops up the language menu above the mic button.
 *    - Dragging finger over language tags highlights options with scale 1.08x.
 *    - Releasing finger over a tag selects it, updates badge on mic icon,
 *      and sets GnaniSttClient language.
 *
 * Anti-flicker & Safe Hiding:
 *    - Completely hidden when copilot is disabled or keyboard drops.
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Overlay Window State ──
    private var overlayRootView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var isOverlayShowing = false
    private var isExpanded = false

    // Position debounce
    private var lastTargetY = -1
    private val POSITION_THRESHOLD_PX = 10
    private val POSITION_DEBOUNCE_MS = 60L
    private var pendingPositionUpdate: Runnable? = null

    // ── Language & STT State ──
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

        /** Master toggle state controlled from dashboard. When false, overlay NEVER appears. */
        @Volatile
        var isCopilotActive: Boolean = false

        /** Preserved mode variable for backward compatibility */
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

        // Load saved language preference
        val prefs = getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
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
        Log.i(TAG, "Created. Lang=$activeLanguageCode ($activeLanguageBadge)")
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
        Log.i(TAG, "Started. isCopilotActive=true — waiting for keyboard trigger.")
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

    // ── Mode API (Backward Compatibility) ─────────────────────────────

    fun setMode(mode: OverlayMode) {
        currentMode = mode
    }

    // ── Show / Reposition Overlay ─────────────────────────────────────

    /**
     * Show (or reposition) the overlay above [inputBounds].
     * Shows the collapsed 42x42dp disk by default unless already expanded in current session.
     */
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

            // If already showing: reposition smoothly (debounced)
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

            // First show: inflate unified layout and mount
            val view = inflateOverlayView(wm)
            val params = buildOverlayParams(targetY, isExpanded)
            try {
                wm.addView(view, params)
                overlayRootView = view
                overlayParams = params
                isOverlayShowing = true
                lastTargetY = targetY
                Log.i(TAG, "Overlay shown at y=$targetY (isExpanded=$isExpanded)")
            } catch (e: Exception) {
                Log.e(TAG, "addView(overlay) failed: ${e.message}")
            }
        }
    }

    /** Compatibility alias */
    fun showToolbar(inputBounds: Rect? = null) = showOverlay(inputBounds)

    /** Compatibility alias */
    fun showEdgePill() = showOverlay(null)

    // ── Hide Overlay ──────────────────────────────────────────────────

    /**
     * Completely removes the overlay from the screen.
     * When hidden, resets expanded state so it reopens as the disk next time.
     */
    fun hideOverlay() {
        mainHandler.post {
            pendingPositionUpdate?.let { mainHandler.removeCallbacks(it) }
            pendingPositionUpdate = null
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

    // ── Expand & Collapse Transitions ─────────────────────────────────

    private fun expandToToolbar() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return
        val screenW = resources.displayMetrics.widthPixels

        isExpanded = true
        // Compact toolbar width: ~72% of screen width
        params.width = (screenW * 0.72f).toInt()

        val disk = view.findViewById<View>(R.id.disk_container)
        val toolbar = view.findViewById<View>(R.id.toolbar_container)

        disk?.visibility = View.GONE
        toolbar?.visibility = View.VISIBLE
        toolbar?.alpha = 0f
        toolbar?.scaleX = 0.4f
        toolbar?.pivotX = 0f
        toolbar?.animate()?.alpha(1f)?.scaleX(1f)?.setDuration(220)?.start()

        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
        Log.d(TAG, "Expanded into 72% toolbar.")
    }

    private fun collapseToDisk() {
        val wm = windowManager ?: return
        val view = overlayRootView ?: return
        val params = overlayParams ?: return

        isExpanded = false
        params.width = WindowManager.LayoutParams.WRAP_CONTENT

        val disk = view.findViewById<View>(R.id.disk_container)
        val toolbar = view.findViewById<View>(R.id.toolbar_container)
        val langMenu = view.findViewById<View>(R.id.language_menu_container)

        langMenu?.visibility = View.GONE
        toolbar?.visibility = View.GONE
        disk?.visibility = View.VISIBLE
        disk?.alpha = 0f
        disk?.scaleX = 0.5f
        disk?.scaleY = 0.5f
        disk?.animate()?.alpha(1f)?.scaleX(1f)?.scaleY(1f)?.setDuration(200)?.start()

        try { wm.updateViewLayout(view, params) } catch (e: Exception) {}
        Log.d(TAG, "Collapsed back into circular disk.")
    }

    // ── View Inflation & Gesture Wiring ────────────────────────────────

    private fun inflateOverlayView(wm: WindowManager): View {
        val view = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null)

        val diskContainer = view.findViewById<FrameLayout>(R.id.disk_container)
        val toolbarContainer = view.findViewById<LinearLayout>(R.id.toolbar_container)
        val langBadge = view.findViewById<TextView>(R.id.txt_lang_badge)
        val collapseHandle = view.findViewById<FrameLayout>(R.id.btn_collapse_handle)
        val dragBar = view.findViewById<View>(R.id.drag_bar)

        // Set initial visibility
        if (isExpanded) {
            diskContainer?.visibility = View.GONE
            toolbarContainer?.visibility = View.VISIBLE
        } else {
            diskContainer?.visibility = View.VISIBLE
            toolbarContainer?.visibility = View.GONE
        }

        langBadge?.text = activeLanguageBadge

        // ── 1. The Collapsed Disk: Tap to expand, or drag ──
        var diskStartX = 0f
        var diskStartY = 0f
        var isDiskDragging = false

        diskContainer?.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    diskStartX = ev.rawX
                    diskStartY = ev.rawY
                    isDiskDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = Math.abs(ev.rawX - diskStartX)
                    val dy = Math.abs(ev.rawY - diskStartY)
                    if (dx > 10 || dy > 10) {
                        isDiskDragging = true
                        val p = overlayParams ?: return@setOnTouchListener false
                        p.y = (p.y + (ev.rawY - diskStartY).toInt()).coerceIn(0, resources.displayMetrics.heightPixels - 100)
                        lastTargetY = p.y
                        diskStartY = ev.rawY
                        try { wm.updateViewLayout(view, p) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDiskDragging) {
                        expandToToolbar()
                    }
                    true
                }
                else -> false
            }
        }

        // ── 2. The Collapse Handle: Tap to shrink back to disk ──
        collapseHandle?.setOnClickListener {
            collapseToDisk()
        }

        // ── 3. Drag Bar for toolbar dragging ──
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        dragBar?.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    val p = overlayParams ?: return@setOnTouchListener false
                    initialX = p.x
                    initialY = p.y
                    initialTouchX = ev.rawX
                    initialTouchY = ev.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val p = overlayParams ?: return@setOnTouchListener false
                    p.x = initialX + (ev.rawX - initialTouchX).toInt()
                    val screenH = resources.displayMetrics.heightPixels
                    p.y = (initialY + (ev.rawY - initialTouchY).toInt()).coerceIn(0, screenH - 100)
                    lastTargetY = p.y
                    try { wm.updateViewLayout(view, p) } catch (e: Exception) {}
                    true
                }
                else -> false
            }
        }

        // ── Action Buttons ──
        view.findViewById<View>(R.id.btn_improve)?.setOnClickListener {
            Toast.makeText(applicationContext, "✨ Improve Text (Gnani Evon) — coming soon", Toast.LENGTH_SHORT).show()
        }
        view.findViewById<View>(R.id.btn_factcheck)?.setOnClickListener {
            Toast.makeText(applicationContext, "🔍 Fact Check — coming soon", Toast.LENGTH_SHORT).show()
        }
        view.findViewById<View>(R.id.btn_icebreaker)?.setOnClickListener {
            Toast.makeText(applicationContext, "🧊 Icebreaker — coming soon", Toast.LENGTH_SHORT).show()
        }

        // ── 4. The Touch & Glide Language Selector on Mic Button ──
        setupGlideLanguageSelector(view)

        return view
    }

    /**
     * Component 3: Glide-Select Language Menu on Mic button
     * - Tap (< 300ms): Starts/stops voice dictation.
     * - Long-press (> 300ms): Pops up vertical language menu.
     * - Drag: Highlights hovered language tag.
     * - Release: Selects highlighted language and updates mic badge.
     */
    private fun setupGlideLanguageSelector(rootView: View) {
        val btnMic = rootView.findViewById<View>(R.id.btn_mic) ?: return
        val langMenu = rootView.findViewById<LinearLayout>(R.id.language_menu_container)
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

        btnMic.setOnTouchListener { v, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    isLongPressActive = false
                    currentlyHoveredPill = null

                    // 300ms long press timer
                    val r = Runnable {
                        isLongPressActive = true
                        v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        langMenu?.visibility = View.VISIBLE
                        langMenu?.alpha = 0f
                        langMenu?.scaleY = 0.8f
                        langMenu?.pivotY = langMenu.height.toFloat()
                        langMenu?.animate()?.alpha(1f)?.scaleY(1f)?.setDuration(160)?.start()
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

                            // Generous touch hit box for easy glide
                            if (rawX in (left.toFloat() - 40)..(right.toFloat() + 40) &&
                                rawY in (top.toFloat() - 6)..(bottom.toFloat() + 6)) {
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
                                    pill.setTextColor(Color.WHITE)
                                } else {
                                    pill.setBackgroundResource(R.drawable.language_pill_bg)
                                    pill.animate().scaleX(1.0f).scaleY(1.0f).setDuration(80).start()
                                    pill.setTypeface(null, Typeface.NORMAL)
                                    pill.setTextColor(Color.parseColor("#F8FAFC"))
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
                        // User released finger after gliding
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

                                // Persist user language preference
                                getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                                    .edit()
                                    .putString("gnani_language", code)
                                    .apply()

                                Toast.makeText(applicationContext, "🗣️ Selected: ${selectedPill.text}", Toast.LENGTH_SHORT).show()
                            }
                        }

                        // Close popup
                        langMenu?.animate()?.alpha(0f)?.setDuration(150)?.withEndAction {
                            langMenu.visibility = View.GONE
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

    // ── Voice Recording & STT (Phase 3) ───────────────────────────────

    fun isVoiceRecording(): Boolean = ::voiceRecorder.isInitialized && voiceRecorder.isRecording()

    fun toggleVoiceRecording() {
        mainHandler.post {
            if (!::voiceRecorder.isInitialized) {
                voiceRecorder = VoiceRecorder(applicationContext)
            }

            if (voiceRecorder.isRecording()) {
                // ── Stop Recording & Transcribe ──
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
                // ── Start Recording ──
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
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_mic)
                    micIconText?.text = "..."
                    micContainer?.alpha = 0.5f
                }
                else -> {
                    micContainer?.setBackgroundResource(R.drawable.btn_bg_mic)
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
        val width = if (expanded) (screenW * 0.72f).toInt() else WindowManager.LayoutParams.WRAP_CONTENT

        return WindowManager.LayoutParams(
            width,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (8 * resources.displayMetrics.density).toInt() // subtle margin from left edge
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
