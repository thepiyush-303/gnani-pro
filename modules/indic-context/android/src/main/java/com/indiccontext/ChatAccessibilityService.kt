package com.indiccontext

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ChatAccessibilityService — Phase 1 Scaffold
 *
 * Captures visible chat bubble [TextView] nodes from supported messaging apps
 * and stores them in [SessionBuffer]. Bridges buffer updates to React Native
 * via [IndicContextModule].
 *
 * ## Supported Apps (Phase 1 heuristics)
 * - com.whatsapp
 * - org.telegram.messenger
 *
 * ## Key Constraints
 * - AccessibilityService can ONLY read CURRENTLY VISIBLE nodes.
 * - No historical access — the [SessionBuffer] is our history layer.
 * - Node traversal is done on the main thread; keep it fast.
 *
 * ## TODO (Phase 2)
 * - Implement app-specific [AppChatAdapter] heuristics for self/other detection.
 * - Add focused EditText tracking for [IndicContextModule.readInputFieldText].
 * - Implement [injectText] fallback clipboard strategy.
 */
class ChatAccessibilityService : AccessibilityService() {

    private val buffer = SessionBuffer()

    /**
     * Debounce handler: we rate-limit buffer-change events to the RN layer
     * to at most one per 500ms to avoid flooding the bridge.
     */
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

        /**
         * Singleton reference so [IndicContextModule] can read the buffer
         * and the focused input node without needing a service binding.
         *
         * Set in [onServiceConnected], cleared in [onDestroy].
         */
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

        // Configure dynamically in case the XML config isn't sufficient
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_SCROLLED or
                AccessibilityEvent.TYPE_VIEW_FOCUSED
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
        Log.i(TAG, "ChatAccessibilityService destroyed. Buffer cleared.")
    }

    override fun onInterrupt() {
        Log.w(TAG, "ChatAccessibilityService interrupted. Will reconnect automatically.")
    }

    // ───────────────────────────────────────────────────────────────
    // Event handling
    // ───────────────────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val event = event ?: return
        val pkg = event.packageName?.toString() ?: return

        // Only process supported chat apps
        if (pkg !in SUPPORTED_PACKAGES) return

        // Check for app/session change
        buffer.resetIfAppChanged(pkg)

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                val root = rootInActiveWindow ?: return
                try {
                    val added = walkAndCapture(root, pkg)
                    if (added > 0) scheduleBufferEvent()
                } finally {
                    root.recycle()
                }
            }

            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                // Track the focused input field for text injection
                val source = event.source ?: return
                if (source.className?.contains("EditText") == true) {
                    focusedInputNode?.recycle()
                    focusedInputNode = source
                    Log.d(TAG, "Input field focused in $pkg")
                    // TODO (Phase 2): emit onInputFieldFocused event
                }
            }
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Node-tree walker
    // ───────────────────────────────────────────────────────────────

    /**
     * Recursively walks the accessibility node tree from [root] and captures
     * any TextView nodes that look like chat bubbles.
     *
     * @return The number of new bubbles added to the buffer.
     *
     * TODO (Phase 2): Replace the generic heuristic with app-specific adapters
     *   (WhatsAppAdapter, TelegramAdapter) that use view IDs / class paths
     *   to precisely identify message containers and determine [isSelf].
     */
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
                    // TODO (Phase 2): determine isSelf from node position / parent container
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

    /** Returns a snapshot of the current session buffer. */
    fun getBuffer(): List<ChatBubble> = buffer.snapshot()

    /**
     * Injects [text] into the currently focused input field.
     *
     * Primary: ACTION_SET_TEXT on the focused EditText node.
     * Fallback: copy to clipboard and ACTION_PASTE.
     *
     * TODO (Phase 2): Implement full injection with clipboard fallback.
     */
    fun injectText(text: String): Boolean {
        val node = focusedInputNode ?: run {
            Log.w(TAG, "injectText: no focused input node")
            return false
        }
        // Phase 1 stub — ACTION_SET_TEXT will be wired in Phase 2
        Log.i(TAG, "injectText (stub): '$text' into ${node.packageName}")
        return true
    }

    /** Returns the current text content of the focused input field, or null. */
    fun readInputFieldText(): String? {
        return focusedInputNode?.text?.toString()
    }

    // ───────────────────────────────────────────────────────────────
    // Debounce bridge events
    // ───────────────────────────────────────────────────────────────

    private fun scheduleBufferEvent() {
        debounceRunnable?.let { debounceHandler.removeCallbacks(it) }
        val r = Runnable {
            // TODO (Phase 2): emit onBufferUpdated to IndicContextModule
            Log.d(TAG, "Buffer update scheduled [size=${buffer.size()}]")
        }
        debounceRunnable = r
        debounceHandler.postDelayed(r, DEBOUNCE_MS)
    }
}
