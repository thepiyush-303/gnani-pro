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
import android.view.accessibility.AccessibilityWindowInfo
import java.security.MessageDigest

/**
 * ChatAccessibilityService — Phase 3
 *
 * Anti-flicker design:
 * - App-switch detection uses a stable [foregroundPkg] tracker updated ONLY on
 *   TYPE_WINDOW_STATE_CHANGED. This prevents false hide/show from keyboard packages.
 * - Overlay show is triggered ONLY on TYPE_VIEW_FOCUSED when the source node is an EditText.
 * - TYPE_WINDOW_CONTENT_CHANGED only triggers buffer capture + debounced badge update.
 *   It does NOT call showToolbar() to avoid WindowManager thrash on every keystroke.
 * - KEYBOARD_SUBSTRINGS: packages matching these strings are completely ignored so
 *   the keyboard sliding in/out does not change [foregroundPkg].
 *
 * Phase 3 additions:
 * - Dual-mode support: INPUT_BAR and EDGE_SLIDER.
 * - In INPUT_BAR mode: toolbar shows only when EditText is focused; hides on blur/app-switch.
 * - In EDGE_SLIDER mode: edge pill shown when supported app is in foreground; pill is removed
 *   when user leaves the supported app. Toolbar expansion is handled inside OverlayService.
 * - Instagram added to SUPPORTED_PACKAGES.
 */
class ChatAccessibilityService : AccessibilityService() {

    private val buffer = SessionBuffer()
    private val mainHandler = Handler(Looper.getMainLooper())

    // Buffer debounce -- emit to JS at most once per 800ms
    private var bufferDebounce: Runnable? = null
    private val BUFFER_DEBOUNCE_MS = 800L

    // State
    private var foregroundPkg: String? = null
    private var inputFocused = false
    private val inputBoundsRect = Rect()
    private var focusedInputNode: AccessibilityNodeInfo? = null

    // Thread Context (Tier 2 Listener identification)
    var activeThreadTitle: String? = null
        private set
    var activeThreadId: String? = null
        private set

    companion object {
        private const val TAG = "ChatA11y"

        // Restricted to WhatsApp only for current phase
        val SUPPORTED_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
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
                AccessibilityEvent.TYPE_VIEW_SCROLLED or
                AccessibilityEvent.TYPE_WINDOWS_CHANGED
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
        OverlayService.instance?.hideOverlay()
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

        // If copilot is disabled from dashboard, do not show any overlay under any circumstances
        if (!OverlayService.isCopilotActive) {
            OverlayService.instance?.hideOverlay()
            return
        }

        // Completely ignore keyboard, system UI, and our own app events
        if (isKeyboard(pkg) || isSystemUi(pkg) || isOurApp(pkg)) return

        when (event.eventType) {

            // ── Reliable foreground-app transition signal ─────────────
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val prevPkg = foregroundPkg
                foregroundPkg = pkg

                if (pkg !in SUPPORTED_PACKAGES) {
                    if (prevPkg in SUPPORTED_PACKAGES) {
                        Log.d(TAG, "Left supported app ($prevPkg -> $pkg)")
                    }
                    onLeftSupportedApp()
                } else {
                    buffer.resetIfAppChanged(pkg)
                    val root = rootInActiveWindow
                    if (root != null) {
                        try {
                            updateActiveThread(root, pkg)
                        } finally {
                            root.recycle()
                        }
                    }
                    // If window changed within the supported app (e.g. backed out of chat to conversation list),
                    // re-verify input bar & keyboard state immediately
                    checkInputBarState(pkg)
                }
            }

            // ── Window hierarchy changed: check keyboard state immediately ───
            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> {
                if (pkg in SUPPORTED_PACKAGES) {
                    checkInputBarState(pkg)
                }
            }

            // ── Input focus: store focus, show ONLY if keyboard is open ──────
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                if (pkg !in SUPPORTED_PACKAGES) return
                val node = event.source ?: return
                handleFocusEvent(node, pkg)
            }

            // ── Click: re-check if input tapped or outside tapped ────────────
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (pkg !in SUPPORTED_PACKAGES) return
                val node = event.source ?: return
                val isEdit = node.className?.contains("EditText", true) == true
                if (!isEdit && inputFocused) {
                    onInputLostFocus()
                } else if (isEdit) {
                    // Tap on EditText brings up keyboard
                    handleFocusEvent(node, pkg)
                    return  // handleFocusEvent already recycles or retains node
                }
                node.recycle()
            }

            // ── Content change: verify keyboard & capture bubbles ────────────
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                if (pkg !in SUPPORTED_PACKAGES) return

                // Check keyboard & input state in real time on EVERY layout/content change!
                if (OverlayService.currentMode == OverlayMode.INPUT_BAR) {
                    checkInputBarState(pkg)
                }

                val root = rootInActiveWindow ?: return
                try {
                    updateActiveThread(root, pkg)
                    val added = walkAndCapture(root, pkg)
                    if (added > 0) scheduleBufferEvent()
                } finally {
                    root.recycle()
                }
            }
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Focus & Keyboard Detection Logic
    // ───────────────────────────────────────────────────────────────

    private fun isKeyboardVisible(): Boolean {
        return try {
            val wins = windows ?: return false
            for (i in 0 until wins.size) {
                val w = wins[i]
                if (w.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    val b = Rect()
                    w.getBoundsInScreen(b)
                    if (b.height() > 100) return true
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun isKeyboardReallyOpen(inputBounds: Rect? = null): Boolean {
        // Signal 1: Input field pushed up by soft keyboard
        if (inputBounds != null && inputBounds.bottom > 0) {
            val screenH = resources.displayMetrics.heightPixels
            val density = resources.displayMetrics.density
            val distanceToBottom = screenH - inputBounds.bottom
            
            // Soft keyboards take up at least 160dp of screen height. 
            if (distanceToBottom > (160 * density).toInt()) {
                return true
            }
        }
        // Signal 2: Input method window active
        return isKeyboardVisible()
    }

    private fun checkInputBarState(pkg: String) {
        val root = rootInActiveWindow ?: return
        try {
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            val isEdit = focused?.className?.contains("EditText", true) == true

            if (!isEdit) {
                // No EditText has focus right now (e.g. user closed keyboard, tapped message, or exited chat)
                if (inputFocused || OverlayService.instance?.isToolbarShowing() == true) {
                    onInputLostFocus()
                }
                focused?.recycle()
                return
            }

            // EditText is focused. Check if keyboard is ACTUALLY open!
            val bounds = Rect()
            focused.getBoundsInScreen(bounds)
            val keyboardOpen = isKeyboardReallyOpen(bounds)

            if (keyboardOpen) {
                if (focusedInputNode == null || focusedInputNode !== focused) {
                    clearFocusedNode()
                    focusedInputNode = focused 
                }
                inputFocused = true
                inputBoundsRect.set(bounds)
                OverlayService.instance?.showOverlay(Rect(bounds))
            } else {
                // If keyboard drops (user pressed back button) or isn't open yet
                onInputLostFocus()
            }
        } catch (e: Exception) {
            Log.w(TAG, "checkInputBarState error: ${e.message}")
        } finally {
            root.recycle()
        }
    }

    private fun handleFocusEvent(node: AccessibilityNodeInfo, pkg: String) {
        val isEdit = node.className?.contains("EditText", true) == true
        if (!isEdit) {
            node.recycle()
            return
        }

        // --- NEW RULE: ONLY TRIGGER IN ACTUAL CHAT ROOMS ---
        val viewId = node.viewIdResourceName
        val isWhatsApp = pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b"
        
        if (isWhatsApp && viewId != "com.whatsapp:id/entry") {
            // It is WhatsApp, but NOT the main chat input (e.g., it's a search bar).
            // Ignore it completely and keep the copilot hidden.
            node.recycle()
            return
        }
        // ---------------------------------------------------

        val bounds = Rect()
        node.getBoundsInScreen(bounds)

        clearFocusedNode()
        focusedInputNode = node // retain
        inputFocused = true
        inputBoundsRect.set(bounds)

        if (isKeyboardReallyOpen(bounds)) {
            OverlayService.instance?.showOverlay(Rect(bounds))
        } else {
            OverlayService.instance?.hideOverlay()
        }

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
        activeThreadTitle = null
        activeThreadId = null
        OverlayService.instance?.hideOverlay()
    }

    private fun clearFocusedNode() {
        try { focusedInputNode?.recycle() } catch (e: Exception) {}
        focusedInputNode = null
    }

    // ───────────────────────────────────────────────────────────────
    // Thread Detection (Tier 2 Listener Identification)
    // ───────────────────────────────────────────────────────────────

    private fun updateActiveThread(root: AccessibilityNodeInfo, pkg: String) {
        var title: String? = null
        try {
            if (pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b") {
                val nodes = root.findAccessibilityNodeInfosByViewId("$pkg:id/conversation_contact_name")
                if (!nodes.isNullOrEmpty()) {
                    val t = nodes[0].text?.toString()?.trim()
                    if (!t.isNullOrEmpty()) {
                        title = t
                    }
                    nodes.forEach { it.recycle() }
                }
            }

            // Fallback: If not found by viewId, inspect top header (top 90dp)
            if (title.isNullOrEmpty()) {
                val density = resources.displayMetrics.density
                val headerMaxY = (90 * density).toInt()
                title = findTopHeaderTitle(root, headerMaxY)
            }
        } catch (e: Exception) {
            Log.w(TAG, "updateActiveThread error: ${e.message}")
        }

        if (!title.isNullOrEmpty() && title != activeThreadTitle) {
            activeThreadTitle = title
            val newId = generateThreadId(title, pkg)
            activeThreadId = newId
            val cleared = buffer.resetIfThreadChanged(pkg, newId)
            if (cleared) {
                OverlayService.instance?.contextMessageCount = 0
                scheduleBufferEvent()
            }
            Log.i(TAG, "Active thread switched: '$title' [ID=$newId]")
        }
    }

    private fun findTopHeaderTitle(root: AccessibilityNodeInfo, headerMaxY: Int): String? {
        val b = Rect()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            val cls = node.className?.toString() ?: ""
            if (cls.endsWith("TextView")) {
                node.getBoundsInScreen(b)
                // Header text is in the top bar (Y between 20dp and 90dp to avoid status bar time/battery)
                if (b.top in 30..headerMaxY && b.height() > 10) {
                    val text = node.text?.toString()?.trim()
                    if (!text.isNullOrEmpty() && text.length in 2..40 && !text.matches(Regex(".*\\d{1,2}:\\d{2}.*"))) {
                        val lc = text.lowercase()
                        if (lc != "whatsapp" && lc != "search" && lc != "online" && lc != "typing...") {
                            if (node !== root) node.recycle()
                            return text
                        }
                    }
                }
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
            if (node !== root) node.recycle()
        }
        return null
    }

    private fun generateThreadId(title: String, pkg: String): String {
        val raw = "$pkg:${title.trim().lowercase()}"
        return try {
            val md = MessageDigest.getInstance("SHA-256")
            val bytes = md.digest(raw.toByteArray(Charsets.UTF_8))
            bytes.take(8).joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            raw.hashCode().toString()
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Buffer capture
    // ───────────────────────────────────────────────────────────────

    private fun walkAndCapture(root: AccessibilityNodeInfo, pkg: String): Int {
        var added = 0
        val screenW = resources.displayMetrics.widthPixels
        val density = resources.displayMetrics.density
        val headerMaxY = (90 * density).toInt()
        val bounds = Rect()

        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            val text = node.text?.toString()
            val cls = node.className?.toString() ?: ""
            if (text != null && text.isNotBlank() && cls.endsWith("TextView")) {
                val cleanText = text.trim()
                node.getBoundsInScreen(bounds)

                // Skip views inside the top header (contact name, status bar, app name)
                val isInHeader = bounds.bottom <= headerMaxY

                // Ignore timestamps (e.g., "10:45 AM", "12:30 pm") and tiny words
                val isTimeStamp = cleanText.matches(Regex(".*\\d{1,2}:\\d{2}.*"))

                if (!isInHeader && cleanText.length > 3 && !isTimeStamp) {
                    val isSelf = when {
                        bounds.left > screenW * 0.28f -> true
                        bounds.right < screenW * 0.82f -> false
                        else -> null
                    }
                    val bubble = ChatBubble(
                        text = cleanText,
                        isSelf = isSelf,
                        nodeClassName = cls,
                        appPackage = pkg,
                    )
                    if (buffer.add(bubble)) added++
                }
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
            Log.d(TAG, "Emitting bufferUpdated [size=${snapshot.size}, thread=$activeThreadTitle ($activeThreadId)]")
            OverlayService.instance?.contextMessageCount = snapshot.size
            IndicContextModule.instance?.emitBufferUpdated(snapshot, activeThreadTitle, activeThreadId)
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
