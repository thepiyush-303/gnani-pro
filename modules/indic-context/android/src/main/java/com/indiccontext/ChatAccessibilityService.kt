package com.indiccontext

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ChatAccessibilityService — Phase 2
 *
 * Anti-flicker design:
 * - App-switch detection uses a stable [foregroundPkg] tracker updated ONLY on
 *   TYPE_WINDOW_STATE_CHANGED. This prevents false hide/show from keyboard packages.
 * - Overlay show is triggered ONLY on TYPE_VIEW_FOCUSED when the source node is an EditText.
 * - TYPE_WINDOW_CONTENT_CHANGED only triggers buffer capture + debounced badge update.
 *   It does NOT call showOverlay() to avoid WindowManager thrash on every keystroke.
 * - KEYBOARD_SUBSTRINGS: packages matching these strings are completely ignored so
 *   the keyboard sliding in/out does not change [foregroundPkg].
 *
 * Phase 2 additions:
 * - Real text injection via ACTION_SET_TEXT + clipboard fallback.
 * - Real buffer events emitted to JS via [IndicContextModule.emitBufferUpdated].
 * - Badge count updates on [OverlayService.contextMessageCount].
 */
class ChatAccessibilityService : AccessibilityService() {

    private val buffer = SessionBuffer()
    private val mainHandler = Handler(Looper.getMainLooper())

    // Buffer debounce — emit to JS at most once per 800ms
    private var bufferDebounce: Runnable? = null
    private val BUFFER_DEBOUNCE_MS = 800L

    // State
    private var foregroundPkg: String? = null
    private var inputFocused = false
    private val inputBoundsRect = Rect()
    private var focusedInputNode: AccessibilityNodeInfo? = null

    companion object {
        private const val TAG = "ChatA11y"

        val SUPPORTED_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "org.telegram.messenger.web",
        )

        /**
         * Substrings that identify soft-keyboard packages.
         * Events from these are completely ignored so the keyboard slide-in/out
         * does not corrupt [foregroundPkg] or trigger spurious hide calls.
         */
        private val KEYBOARD_SUBSTRINGS = listOf(
            "inputmethod", "keyboard", "ime.",
            "gboard", "swiftkey", "honeyboard", "fleksy",
            "samsung.android.server", "google.android.tts",
            "asus.inputmethod",
        )

        @Volatile
        var instance: ChatAccessibilityService? = null
            private set
    }

    // ───────────────────────────────────────────────────────────────
    // Lifecycle
    // ───────────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        val info = AccessibilityServiceInfo().apply {
            eventTypes =
                AccessibilityEvent.TYPE_VIEW_FOCUSED or
                AccessibilityEvent.TYPE_VIEW_CLICKED or
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_SCROLLED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
            // No packageNames filter: we need WINDOW_STATE_CHANGED from any app
            // to reliably detect navigation away from WhatsApp/Telegram.
        }
        serviceInfo = info
        Log.i(TAG, "Connected.")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        mainHandler.removeCallbacksAndMessages(null)
        buffer.clear()
        clearFocusedNode()
        Log.i(TAG, "Destroyed.")
    }

    override fun onInterrupt() {
        Log.w(TAG, "Interrupted.")
    }

    // ───────────────────────────────────────────────────────────────
    // Package helpers
    // ───────────────────────────────────────────────────────────────

    private fun isKeyboard(pkg: String): Boolean {
        val lc = pkg.lowercase()
        return KEYBOARD_SUBSTRINGS.any { lc.contains(it) }
    }

    private fun isOurApp(pkg: String) = pkg == "com.indiccontext.assistant"
    private fun isSystemUi(pkg: String) =
        pkg.startsWith("com.android.systemui") || pkg.startsWith("com.android.launcher")

    // ───────────────────────────────────────────────────────────────
    // Event routing
    // ───────────────────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val event = event ?: return
        val pkg = event.packageName?.toString() ?: return

        // Completely ignore keyboard, system UI, and our own app events
        if (isKeyboard(pkg) || isSystemUi(pkg) || isOurApp(pkg)) return

        when (event.eventType) {

            // ── Reliable foreground-app transition signal ─────────────
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (pkg == foregroundPkg) return
                Log.d(TAG, "Foreground: $foregroundPkg → $pkg")
                foregroundPkg = pkg

                if (pkg !in SUPPORTED_PACKAGES) {
                    // Left WhatsApp / Telegram
                    onLeftSupportedApp()
                } else {
                    buffer.resetIfAppChanged(pkg)
                }
            }

            // ── Input focus: the ONE trigger for showing the overlay ──
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                if (pkg !in SUPPORTED_PACKAGES) return
                val node = event.source ?: return
                handleFocusEvent(node, pkg)
            }

            // ── Click: hide if user taps outside the input ────────────
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (pkg !in SUPPORTED_PACKAGES) return
                val node = event.source ?: return
                val isEdit = node.className?.contains("EditText", true) == true
                if (!isEdit && inputFocused) {
                    onInputLostFocus()
                } else if (isEdit) {
                    // Re-read bounds in case user tapped a different edit field
                    handleFocusEvent(node, pkg)
                    return  // handleFocusEvent already recycles or retains node
                }
                node.recycle()
            }

            // ── Content change: capture bubbles only ─────────────────
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                if (pkg !in SUPPORTED_PACKAGES) return
                val root = rootInActiveWindow ?: return
                try {
                    val added = walkAndCapture(root, pkg)
                    if (added > 0) scheduleBufferEvent()
                } finally {
                    root.recycle()
                }
            }
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Focus logic
    // ───────────────────────────────────────────────────────────────

    private fun handleFocusEvent(node: AccessibilityNodeInfo, pkg: String) {
        val isEdit = node.className?.contains("EditText", true) == true
        if (!isEdit) {
            node.recycle()
            return
        }

        clearFocusedNode()
        focusedInputNode = node   // retain; do NOT recycle
        inputFocused = true

        node.getBoundsInScreen(inputBoundsRect)
        Log.d(TAG, "EditText focused in $pkg bounds=$inputBoundsRect")

        OverlayService.instance?.showOverlay(Rect(inputBoundsRect))

        val text = node.text?.toString() ?: ""
        IndicContextModule.instance?.emitInputFocused(pkg, text)
    }

    private fun onInputLostFocus() {
        inputFocused = false
        clearFocusedNode()
        OverlayService.instance?.hideOverlay()
        IndicContextModule.instance?.emitInputBlurred(foregroundPkg ?: "")
    }

    private fun onLeftSupportedApp() {
        inputFocused = false
        clearFocusedNode()
        OverlayService.instance?.hideOverlay()
    }

    private fun clearFocusedNode() {
        try { focusedInputNode?.recycle() } catch (e: Exception) {}
        focusedInputNode = null
    }

    // ───────────────────────────────────────────────────────────────
    // Buffer capture
    // ───────────────────────────────────────────────────────────────

    private fun walkAndCapture(root: AccessibilityNodeInfo, pkg: String): Int {
        var added = 0
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            val text = node.text?.toString()
            val cls = node.className?.toString() ?: ""
            if (text != null && text.isNotBlank() && cls.endsWith("TextView") && text.length > 1) {
                val bubble = ChatBubble(
                    text = text.trim(),
                    isSelf = null,
                    nodeClassName = cls,
                    appPackage = pkg,
                )
                if (buffer.add(bubble)) added++
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let { queue.add(it) }
            if (node !== root) node.recycle()
        }
        return added
    }

    // ───────────────────────────────────────────────────────────────
    // Buffer event → JS bridge (debounced)
    // ───────────────────────────────────────────────────────────────

    private fun scheduleBufferEvent() {
        bufferDebounce?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            val snapshot = buffer.snapshot()
            Log.d(TAG, "Emitting bufferUpdated [size=${snapshot.size}]")
            OverlayService.instance?.contextMessageCount = snapshot.size
            IndicContextModule.instance?.emitBufferUpdated(snapshot)
        }
        bufferDebounce = r
        mainHandler.postDelayed(r, BUFFER_DEBOUNCE_MS)
    }

    // ───────────────────────────────────────────────────────────────
    // Public API (IndicContextModule → JS bridge)
    // ───────────────────────────────────────────────────────────────

    fun getBuffer(): List<ChatBubble> = buffer.snapshot()

    fun readInputFieldText(): String? = focusedInputNode?.text?.toString()

    /**
     * Injects [text] into the currently focused chat input.
     *
     * Strategy 1 (API 21+): ACTION_SET_TEXT — replaces the entire field content.
     * Strategy 2 (fallback): clipboard + ACTION_PASTE — appends at cursor position.
     */
    fun injectText(text: String): Boolean {
        val node = focusedInputNode ?: run {
            Log.w(TAG, "injectText: no focused input node")
            return false
        }

        // Strategy 1: ACTION_SET_TEXT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                Log.i(TAG, "injectText: ACTION_SET_TEXT succeeded")
                return true
            }
            Log.w(TAG, "injectText: ACTION_SET_TEXT failed — trying clipboard")
        }

        // Strategy 2: clipboard + ACTION_PASTE
        return try {
            val clip = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clip.setPrimaryClip(ClipData.newPlainText("copilot_inject", text))
            val ok = node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            Log.i(TAG, "injectText: clipboard paste result=$ok")
            ok
        } catch (e: Exception) {
            Log.e(TAG, "injectText: clipboard fallback error", e)
            false
        }
    }
}
