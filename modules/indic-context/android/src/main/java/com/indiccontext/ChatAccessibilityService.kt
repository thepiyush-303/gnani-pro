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
 * Soft-Keyboard Bounds Verification & Auto-Dismiss Guard:
 * - Verifies real-time height of soft-keyboard IME window (>120dp) and input field screen offset.
 * - Shows assistant immediately when keyboard opens.
 * - Automatically hides assistant when keyboard is dismissed/closed.
 * - Retains overlay while in WhatsApp chat.
 */
class ChatAccessibilityService : AccessibilityService() {

    private val buffer = SessionBuffer()
    private val mainHandler = Handler(Looper.getMainLooper())

    // Buffer debounce -- emit to JS at most once per 800ms
    private var bufferDebounce: Runnable? = null
    private val BUFFER_DEBOUNCE_MS = 800L

    // Throttling / Debouncing for performance & keyboard animation delay
    private var lastContentCheckTime = 0L
    private val CONTENT_CHECK_THROTTLE_MS = 200L
    private var contentCaptureDebounce: Runnable? = null
    private val CAPTURE_DEBOUNCE_MS = 800L

    private var keyboardCheckPollRunnable: Runnable? = null
    private var verifiedInputLossRunnable: Runnable? = null
    private val VERIFIED_LOSS_DELAY_MS = 250L

    // State
    private var foregroundPkg: String? = null
    private var inputFocused = false
    private var isKeyboardCurrentlyOpen = false
    private val inputBoundsRect = Rect()
    private var focusedInputNode: AccessibilityNodeInfo? = null

    // Thread Context (Tier 2 Listener identification)
    var activeThreadTitle: String? = null
        private set
    var activeThreadId: String? = null
        private set

    companion object {
        private const val TAG = "ChatA11y"

        val SUPPORTED_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
        )

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
        OverlayService.instance?.hideOverlay(immediate = true)
        Log.i(TAG, "Destroyed.")
    }

    override fun onInterrupt() {
        Log.w(TAG, "Interrupted.")
    }

    private fun isKeyboard(pkg: String): Boolean {
        val lc = pkg.lowercase()
        return KEYBOARD_SUBSTRINGS.any { lc.contains(it) }
    }

    private fun isOurApp(pkg: String) = pkg == "com.indiccontext.assistant"
    private fun isSystemUi(pkg: String) =
        pkg.startsWith("com.android.systemui") || pkg.startsWith("com.android.launcher")

    private fun isSupportedAppInForeground(): Boolean {
        try {
            val wins = windows
            if (wins != null) {
                for (i in 0 until wins.size) {
                    val w = wins[i]
                    if (w.type == AccessibilityWindowInfo.TYPE_APPLICATION) {
                        val root = w.root
                        val p = root?.packageName?.toString() ?: w.title?.toString() ?: ""
                        if (root != null) {
                            try { root.recycle() } catch (e: Exception) {}
                        }
                        if (p in SUPPORTED_PACKAGES) {
                            return true
                        }
                    }
                }
            }
        } catch (e: Exception) {}

        val activeRoot = rootInActiveWindow
        if (activeRoot != null) {
            val p = activeRoot.packageName?.toString() ?: ""
            try { activeRoot.recycle() } catch (e: Exception) {}
            if (p in SUPPORTED_PACKAGES) {
                return true
            }
        }

        return false
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val event = event ?: return
        val pkg = event.packageName?.toString() ?: return

        if (!OverlayService.isCopilotActive) {
            OverlayService.instance?.hideOverlay(immediate = true)
            return
        }

        if (isKeyboard(pkg) || isSystemUi(pkg) || isOurApp(pkg)) return

        when (event.eventType) {

            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val inSupportedApp = isSupportedAppInForeground()

                if (!inSupportedApp) {
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

            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> {
                if (isSupportedAppInForeground()) {
                    checkInputBarState("com.whatsapp")
                    scheduleKeyboardPoll("com.whatsapp")
                } else {
                    onLeftSupportedApp()
                }
            }

            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                if (!isSupportedAppInForeground()) return
                val node = event.source ?: return
                handleFocusEvent(node, "com.whatsapp")
            }

            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (!isSupportedAppInForeground()) return
                val node = event.source ?: return
                val isEdit = node.className?.contains("EditText", true) == true
                if (!isEdit && inputFocused) {
                    scheduleVerifiedInputLoss()
                } else if (isEdit) {
                    handleFocusEvent(node, "com.whatsapp")
                    return
                }
                node.recycle()
            }

            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                if (!isSupportedAppInForeground()) return

                val now = System.currentTimeMillis()
                if (now - lastContentCheckTime > CONTENT_CHECK_THROTTLE_MS) {
                    lastContentCheckTime = now
                    if (OverlayService.currentMode == OverlayMode.INPUT_BAR) {
                        checkInputBarState("com.whatsapp")
                    }
                }

                contentCaptureDebounce?.let { mainHandler.removeCallbacks(it) }
                val captureTask = Runnable {
                    val root = rootInActiveWindow ?: return@Runnable
                    try {
                        updateActiveThread(root, pkg)
                        val added = walkAndCapture(root, pkg)
                        if (added > 0) scheduleBufferEvent()
                    } finally {
                        try { root.recycle() } catch (e: Exception) {}
                    }
                }
                contentCaptureDebounce = captureTask
                mainHandler.postDelayed(captureTask, CAPTURE_DEBOUNCE_MS)
            }
        }
    }

    private fun isKeyboardVisible(): Boolean {
        return try {
            val wins = windows ?: return false
            val screenH = resources.displayMetrics.heightPixels
            val density = resources.displayMetrics.density

            for (i in 0 until wins.size) {
                val w = wins[i]
                if (w.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    val b = Rect()
                    w.getBoundsInScreen(b)
                    // The soft keyboard must occupy substantial height (> 120dp) and be visible on screen
                    if (b.height() > (120 * density).toInt() && b.top < screenH) {
                        return true
                    }
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun isKeyboardReallyOpen(inputNode: AccessibilityNodeInfo?): Boolean {
        val screenH = resources.displayMetrics.heightPixels
        val density = resources.displayMetrics.density

        // Signal 1: Check active soft-keyboard window height on screen
        if (isKeyboardVisible()) {
            return true
        }

        // Signal 2: Check if input field is pushed UP from screen bottom by soft keyboard
        if (inputNode != null) {
            val bounds = Rect()
            try {
                inputNode.getBoundsInScreen(bounds)
                if (bounds.bottom > 0 && bounds.top > 0) {
                    val distanceToBottom = screenH - bounds.bottom
                    if (distanceToBottom > (100 * density).toInt()) {
                        return true
                    }
                }
            } catch (e: Exception) {}
        }

        return false
    }

    private fun findActiveEditText(): AccessibilityNodeInfo? {
        val activeRoot = rootInActiveWindow
        var node = searchTreeForEditText(activeRoot)
        if (node != null) return node

        try {
            val wins = windows
            if (wins != null) {
                for (i in 0 until wins.size) {
                    val w = wins[i]
                    if (w.type == AccessibilityWindowInfo.TYPE_APPLICATION) {
                        val appRoot = w.root ?: continue
                        val found = searchTreeForEditText(appRoot)
                        if (found != null) return found
                    }
                }
            }
        } catch (e: Exception) {}

        return null
    }

    private fun searchTreeForEditText(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (root == null) return null

        try {
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focused != null && focused.className?.contains("EditText", true) == true) {
                val viewId = focused.viewIdResourceName?.lowercase() ?: ""
                if (!viewId.contains("search") && !viewId.contains("subject")) {
                    return focused
                }
            }
            focused?.recycle()
        } catch (e: Exception) {}

        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var fallbackEditText: AccessibilityNodeInfo? = null

        while (queue.isNotEmpty()) {
            val curr = queue.removeFirst()
            if (curr.className?.contains("EditText", true) == true) {
                val viewId = curr.viewIdResourceName?.lowercase() ?: ""
                val isSearch = viewId.contains("search") || viewId.contains("subject")
                if (!isSearch) {
                    if (curr.isFocused) {
                        return curr
                    }
                    if (fallbackEditText == null) {
                        fallbackEditText = curr
                    }
                }
            }
            for (i in 0 until curr.childCount) {
                curr.getChild(i)?.let { queue.add(it) }
            }
            if (curr !== root && curr !== fallbackEditText) {
                curr.recycle()
            }
        }
        return fallbackEditText
    }

    private fun checkInputBarState(pkg: String) {
        if (!isSupportedAppInForeground()) {
            onLeftSupportedApp()
            return
        }

        val editNode = findActiveEditText()

        if (editNode == null) {
            if (inputFocused || isKeyboardCurrentlyOpen) {
                scheduleVerifiedInputLoss()
            }
            return
        }

        val bounds = Rect()
        editNode.getBoundsInScreen(bounds)
        val keyboardOpen = isKeyboardReallyOpen(editNode)

        if (keyboardOpen) {
            cancelVerifiedInputLoss()
            if (focusedInputNode == null || focusedInputNode !== editNode) {
                clearFocusedNode()
                focusedInputNode = editNode
            }
            inputFocused = true
            isKeyboardCurrentlyOpen = true
            inputBoundsRect.set(bounds)
            OverlayService.instance?.showOverlay(Rect(bounds))
        } else {
            // Keyboard is CLOSED on screen -> hide overlay immediately
            onInputLostFocus()
        }
    }

    private fun handleFocusEvent(node: AccessibilityNodeInfo, pkg: String) {
        val isEdit = node.className?.contains("EditText", true) == true
        if (!isEdit) {
            node.recycle()
            return
        }

        val viewId = node.viewIdResourceName?.lowercase()
        if (viewId != null && (viewId.contains("search") || viewId.contains("subject"))) {
            node.recycle()
            return
        }

        val bounds = Rect()
        node.getBoundsInScreen(bounds)

        clearFocusedNode()
        focusedInputNode = node
        inputFocused = true
        inputBoundsRect.set(bounds)

        if (isKeyboardReallyOpen(node)) {
            cancelVerifiedInputLoss()
            isKeyboardCurrentlyOpen = true
            OverlayService.instance?.showOverlay(Rect(bounds))
        } else {
            scheduleKeyboardPoll(pkg)
        }

        val text = node.text?.toString() ?: ""
        IndicContextModule.instance?.emitInputFocused(pkg, text)
    }

    private fun scheduleKeyboardPoll(pkg: String) {
        keyboardCheckPollRunnable?.let { mainHandler.removeCallbacks(it) }

        var attempts = 0
        val maxAttempts = 20 // Poll up to 1.0s (20 x 50ms)

        val r = object : Runnable {
            override fun run() {
                if (!isSupportedAppInForeground()) return

                val node = findActiveEditText()
                if (node != null) {
                    try {
                        if (isKeyboardReallyOpen(node)) {
                            val bounds = Rect()
                            node.getBoundsInScreen(bounds)
                            cancelVerifiedInputLoss()
                            clearFocusedNode()
                            focusedInputNode = node
                            inputFocused = true
                            isKeyboardCurrentlyOpen = true
                            inputBoundsRect.set(bounds)
                            OverlayService.instance?.showOverlay(Rect(bounds))
                            return
                        }
                    } catch (e: Exception) {}
                }

                attempts++
                if (attempts < maxAttempts) {
                    mainHandler.postDelayed(this, 50L)
                }
            }
        }
        keyboardCheckPollRunnable = r
        mainHandler.post(r)
    }

    private fun scheduleVerifiedInputLoss() {
        if (verifiedInputLossRunnable != null) return
        val r = Runnable {
            verifiedInputLossRunnable = null
            if (!isSupportedAppInForeground()) {
                onInputLostFocus()
                return@Runnable
            }

            val node = findActiveEditText()
            var stillOpen = false
            if (node != null) {
                try {
                    if (isKeyboardReallyOpen(node)) {
                        stillOpen = true
                    }
                } catch (e: Exception) {}
            }

            if (!stillOpen) {
                onInputLostFocus()
            }
        }
        verifiedInputLossRunnable = r
        mainHandler.postDelayed(r, VERIFIED_LOSS_DELAY_MS)
    }

    private fun cancelVerifiedInputLoss() {
        verifiedInputLossRunnable?.let { mainHandler.removeCallbacks(it) }
        verifiedInputLossRunnable = null
    }

    private fun onInputLostFocus() {
        keyboardCheckPollRunnable?.let { mainHandler.removeCallbacks(it) }
        keyboardCheckPollRunnable = null
        cancelVerifiedInputLoss()
        inputFocused = false
        isKeyboardCurrentlyOpen = false
        clearFocusedNode()
        OverlayService.instance?.hideOverlay()
        IndicContextModule.instance?.emitInputBlurred(foregroundPkg ?: "")
    }

    private fun onLeftSupportedApp() {
        if (isSupportedAppInForeground()) {
            return
        }
        keyboardCheckPollRunnable?.let { mainHandler.removeCallbacks(it) }
        keyboardCheckPollRunnable = null
        cancelVerifiedInputLoss()
        contentCaptureDebounce?.let { mainHandler.removeCallbacks(it) }
        contentCaptureDebounce = null
        inputFocused = false
        isKeyboardCurrentlyOpen = false
        activeThreadTitle = null
        activeThreadId = null
        clearFocusedNode()
        OverlayService.instance?.hideOverlay(immediate = true)
        OverlayService.instance?.hideRecommendations()
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
                // Header text is in the top bar (Y between 30 and headerMaxY to avoid status bar time/battery)
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

    fun getBuffer(): List<ChatBubble> = buffer.snapshot()

    fun readInputFieldText(): String? {
        try {
            focusedInputNode?.refresh()
            val text = focusedInputNode?.text?.toString()
            if (!text.isNullOrBlank()) return text
        } catch (e: Exception) {}

        // Fallback: search tree for active or fallback EditText
        val active = findActiveEditText()
        if (active != null) {
            val t = active.text?.toString()
            if (focusedInputNode == null) {
                focusedInputNode = active
            } else if (focusedInputNode !== active) {
                try { active.recycle() } catch (e: Exception) {}
            }
            return t
        }
        return null
    }

    fun injectText(text: String): Boolean {
        var node = focusedInputNode
        if (node == null) {
            node = findActiveEditText()
            if (node != null) {
                focusedInputNode = node
            }
        }
        val target = node ?: run {
            Log.w(TAG, "injectText: no focused or active input node")
            return false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            if (target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                Log.i(TAG, "injectText: ACTION_SET_TEXT succeeded")
                return true
            }
            Log.w(TAG, "injectText: ACTION_SET_TEXT failed — trying clipboard")
        }

        return try {
            val clip = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clip.setPrimaryClip(ClipData.newPlainText("copilot_inject", text))
            val ok = target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            Log.i(TAG, "injectText: clipboard paste result=$ok")
            ok
        } catch (e: Exception) {
            Log.e(TAG, "injectText: clipboard fallback error", e)
            false
        }
    }
}
