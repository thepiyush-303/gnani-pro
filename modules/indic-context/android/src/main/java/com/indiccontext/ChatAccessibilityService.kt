package com.indiccontext

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ChatAccessibilityService
 *
 * Responsibilities:
 * 1. Captures visible chat bubble [TextView] nodes from supported messaging apps into [SessionBuffer].
 * 2. Detects when an input field (EditText) is active in WhatsApp/Telegram to auto-show the copilot overlay.
 * 3. Detects when the user leaves the chat or switches apps to auto-hide the overlay immediately.
 */
class ChatAccessibilityService : AccessibilityService() {

    private val buffer = SessionBuffer()

    private val debounceHandler = Handler(Looper.getMainLooper())
    private var debounceRunnable: Runnable? = null
    private val DEBOUNCE_MS = 500L

    /** The currently focused EditText node (for text injection). Nullable. */
    private var focusedInputNode: AccessibilityNodeInfo? = null

    companion object {
        private const val TAG = "ChatAccessibility"

        /** The set of package names whose content we actively parse. */
        val SUPPORTED_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",        // WhatsApp Business
            "org.telegram.messenger",
            "org.telegram.messenger.web",
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

        // Configure dynamically without package restrictions so we can detect window transitions
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_SCROLLED or
                AccessibilityEvent.TYPE_VIEW_FOCUSED or
                AccessibilityEvent.TYPE_VIEW_CLICKED or
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
        serviceInfo = info

        Log.i(TAG, "ChatAccessibilityService connected.")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        debounceHandler.removeCallbacks(debounceRunnable ?: return)
        buffer.clear()
        focusedInputNode?.recycle()
        focusedInputNode = null
        Log.i(TAG, "ChatAccessibilityService destroyed. Buffer cleared.")
    }

    override fun onInterrupt() {
        Log.w(TAG, "ChatAccessibilityService interrupted. Will reconnect automatically.")
    }

    // ───────────────────────────────────────────────────────────────
    // Event handling
    // ───────────────────────────────────────────────────────────────

    private fun isKeyboardPackage(pkg: String): Boolean {
        val p = pkg.lowercase()
        return p.contains("inputmethod") || p.contains("keyboard") ||
            p.contains("honeyboard") || p.contains("swiftkey") ||
            p.contains("fleksy") || p.contains("gboard")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val event = event ?: return
        val pkg = event.packageName?.toString() ?: return

        // 1. If active package is NOT a supported chat app and NOT a soft keyboard:
        // User is on home screen, launcher, settings, or another app -> hide overlay immediately!
        if (pkg !in SUPPORTED_PACKAGES && !isKeyboardPackage(pkg)) {
            OverlayService.instance?.hideOverlay()
            focusedInputNode?.recycle()
            focusedInputNode = null
            return
        }

        // Ignore keyboard package events
        if (isKeyboardPackage(pkg)) {
            return
        }

        // 2. We are in a supported chat app (e.g. WhatsApp, Telegram)
        buffer.resetIfAppChanged(pkg)

        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val source = event.source ?: return
                val isInput = source.className?.contains("EditText", ignoreCase = true) == true
                if (isInput) {
                    focusedInputNode?.recycle()
                    focusedInputNode = source
                    Log.d(TAG, "Input field focused/clicked in $pkg")

                    val rect = Rect()
                    source.getBoundsInScreen(rect)
                    OverlayService.instance?.showOverlay(rect)
                } else if (event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
                    // Clicking outside the input field in chat -> hide overlay
                    OverlayService.instance?.hideOverlay()
                }
            }

            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // If overlay is showing, adjust docked position if input field moved (e.g. keyboard opened)
                if (OverlayService.instance?.isShowing() == true) {
                    focusedInputNode?.let { node ->
                        try {
                            val rect = Rect()
                            node.getBoundsInScreen(rect)
                            if (rect.top > 0) {
                                OverlayService.instance?.showOverlay(rect)
                            }
                        } catch (e: Exception) {
                            // Node might be unsealed
                        }
                    }
                }

                val root = rootInActiveWindow ?: return
                try {
                    val added = walkAndCapture(root, pkg)
                    if (added > 0) scheduleBufferEvent()
                } finally {
                    root.recycle()
                }
            }

            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                val root = rootInActiveWindow ?: return
                try {
                    val added = walkAndCapture(root, pkg)
                    if (added > 0) scheduleBufferEvent()
                } finally {
                    root.recycle()
                }
            }

            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                // Check if active window is still a chat window with an input field
                val root = rootInActiveWindow
                if (root != null) {
                    try {
                        val hasInput = findEditText(root)
                        if (!hasInput) {
                            OverlayService.instance?.hideOverlay()
                            focusedInputNode?.recycle()
                            focusedInputNode = null
                        }
                    } finally {
                        root.recycle()
                    }
                }
            }
        }
    }

    private fun findEditText(root: AccessibilityNodeInfo): Boolean {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            if (node.className?.contains("EditText", ignoreCase = true) == true) {
                if (node !== root) node.recycle()
                return true
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
            if (node !== root) node.recycle()
        }
        return false
    }

    // ───────────────────────────────────────────────────────────────
    // Node-tree walker
    // ───────────────────────────────────────────────────────────────

    private fun walkAndCapture(root: AccessibilityNodeInfo, pkg: String): Int {
        var addedCount = 0
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)

        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()

            val text = node.text?.toString()
            val className = node.className?.toString() ?: ""

            // Generic heuristic: a non-empty TextView child of a scrollable container
            if (
                text != null &&
                text.isNotBlank() &&
                className.endsWith("TextView") &&
                text.length > 1
            ) {
                val bubble = ChatBubble(
                    text = text.trim(),
                    isSelf = null,
                    nodeClassName = className,
                    appPackage = pkg,
                )
                val added = buffer.add(bubble)
                if (added) addedCount++
            }

            // Enqueue children
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }

            // Recycle intermediate nodes (not root — caller recycles that)
            if (node !== root) node.recycle()
        }

        return addedCount
    }

    // ───────────────────────────────────────────────────────────────
    // Public API (called by IndicContextModule)
    // ───────────────────────────────────────────────────────────────

    fun getBuffer(): List<ChatBubble> = buffer.snapshot()

    fun injectText(text: String): Boolean {
        val node = focusedInputNode ?: run {
            Log.w(TAG, "injectText: no focused input node")
            return false
        }
        Log.i(TAG, "injectText (stub): '$text' into ${node.packageName}")
        return true
    }

    fun readInputFieldText(): String? {
        return focusedInputNode?.text?.toString()
    }

    // ───────────────────────────────────────────────────────────────
    // Debounce bridge events
    // ───────────────────────────────────────────────────────────────

    private fun scheduleBufferEvent() {
        debounceRunnable?.let { debounceHandler.removeCallbacks(it) }
        val r = Runnable {
            Log.d(TAG, "Buffer update scheduled [size=${buffer.size()}]")
        }
        debounceRunnable = r
        debounceHandler.postDelayed(r, DEBOUNCE_MS)
    }
}
