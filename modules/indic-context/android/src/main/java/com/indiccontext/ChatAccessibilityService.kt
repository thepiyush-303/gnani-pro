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

    // ── Chat-room visibility (the pill exists only inside a WhatsApp chat room) ──
    private val CHAT_ROOM_CHECK_DELAY_MS = 120L
    private val chatRoomCheck = Runnable { updateChatRoomOverlay() }
    private var lastImeVisible = false

    // State
    /** Package of the supported chat app whose window is active, set by [updateChatRoomOverlay]. */
    private var foregroundPkg: String? = null

    /** The supported chat app currently in front (e.g. "com.whatsapp" / "com.whatsapp.w4b"), if any. */
    val currentChatPackage: String?
        get() = foregroundPkg?.takeIf { it in SUPPORTED_PACKAGES }

    private val autoSender by lazy { WhatsAppAutoSender(this) }

    /**
     * Title of the WhatsApp conversation open RIGHT NOW (read fresh from the
     * screen, not the cached [activeThreadTitle]) with its package, or null if
     * the foreground screen isn't a conversation.
     */
    fun openConversation(): Pair<String, String>? {
        val root = try { rootInActiveWindow } catch (e: Exception) { null } ?: return null
        try {
            val pkg = root.packageName?.toString() ?: return null
            if (pkg !in SUPPORTED_PACKAGES) return null
            val title = firstText(root, "$pkg:id/conversation_contact_name") ?: return null
            return WhatsAppAutoSender.normalize(title).takeIf { it.isNotEmpty() }?.let { it to pkg }
        } finally {
            safeRecycle(root)
        }
    }

    /** Selects [title] in WhatsApp's share picker and taps send (see [WhatsAppAutoSender]). */
    fun startAutoSend(title: String, pkg: String, onDone: (Boolean, String) -> Unit) =
        autoSender.start(title, pkg, onDone)
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

        @Volatile
        var lastKnownInputText: String = ""
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        val info = AccessibilityServiceInfo().apply {
            eventTypes =
                AccessibilityEvent.TYPE_VIEW_FOCUSED or
                AccessibilityEvent.TYPE_VIEW_CLICKED or
                AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_VIEW_SCROLLED or
                AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 50
        }
        serviceInfo = info
        Log.i(TAG, "Connected.")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        mainHandler.removeCallbacksAndMessages(null)
        autoSender.cancel()
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

        if (!OverlayService.isCopilotActive) {
            OverlayService.instance?.hideOverlay(immediate = true)
            return
        }

        // Window changes from ANY app (launcher, system UI, our dashboard, WhatsApp) re-evaluate
        // whether a chat room is in front. This is what hides the pill on Home / Recents.
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED
        ) {
            scheduleChatRoomCheck()
        }

        val pkg = event.packageName?.toString() ?: return
        if (isKeyboard(pkg) || isSystemUi(pkg) || isOurApp(pkg)) return

        when (event.eventType) {

            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (!isSupportedAppInForeground()) {
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
                }
            }

            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                if (!isSupportedAppInForeground()) return
                val node = event.source ?: return
                handleFocusEvent(node, pkg)
            }

            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (!isSupportedAppInForeground()) return
                val node = event.source ?: return
                if (node.className?.contains("EditText", true) == true) {
                    handleFocusEvent(node, pkg)
                    val currentText = node.text?.toString() ?: ""
                    if (currentText.isNotBlank()) {
                        lastKnownInputText = currentText
                    }
                    return
                }
                node.recycle()
            }

            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED -> {
                if (!isSupportedAppInForeground()) return
                val textList = event.text
                if (!textList.isNullOrEmpty()) {
                    val typed = textList.joinToString("").trim()
                    if (typed.isNotBlank()) {
                        lastKnownInputText = typed
                    }
                }
                val node = event.source
                if (node != null && node.className?.contains("EditText", true) == true) {
                    focusedInputNode = node
                    val nodeText = node.text?.toString() ?: ""
                    if (nodeText.isNotBlank()) {
                        lastKnownInputText = nodeText
                    }
                }
            }

            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                if (!isSupportedAppInForeground()) return

                // In-app navigation (e.g. home → search) often fires only content changes;
                // also keeps the pill above the input bar as the keyboard moves it.
                val now = System.currentTimeMillis()
                if (now - lastContentCheckTime > CONTENT_CHECK_THROTTLE_MS) {
                    lastContentCheckTime = now
                    scheduleChatRoomCheck()
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

    // ───────────────────────────────────────────────────────────────
    // Chat-room visibility
    // ───────────────────────────────────────────────────────────────

    private fun scheduleChatRoomCheck() {
        mainHandler.removeCallbacks(chatRoomCheck)
        mainHandler.postDelayed(chatRoomCheck, CHAT_ROOM_CHECK_DELAY_MS)
    }

    /**
     * Bounds of the message input if the ACTIVE window is a WhatsApp chat room,
     * i.e. it has the chat header (`conversation_contact_name`) AND the message box
     * (`entry`). Home, status, archived, search, channels, the share picker and
     * admin-only groups don't have both → null. IDs verified on WhatsApp 2.26.
     * Our own overlay windows are never "active" (FLAG_NOT_FOCUSABLE).
     */
    private fun chatRoomInputBounds(): Pair<String, Rect>? {
        val root = try { rootInActiveWindow } catch (e: Exception) { null } ?: return null
        try {
            val pkg = root.packageName?.toString() ?: return null
            if (pkg !in SUPPORTED_PACKAGES) return null
            val header = try { root.findAccessibilityNodeInfosByViewId("$pkg:id/conversation_contact_name") } catch (e: Exception) { null }
            val hasHeader = !header.isNullOrEmpty()
            header?.forEach { safeRecycle(it) }
            if (!hasHeader) return null
            val entries = try { root.findAccessibilityNodeInfosByViewId("$pkg:id/entry") } catch (e: Exception) { null }
                ?: return null
            var bounds: Rect? = null
            for (n in entries) {
                if (bounds == null && n.isVisibleToUser) {
                    bounds = Rect().also { n.getBoundsInScreen(it) }.takeIf { !it.isEmpty }
                }
                safeRecycle(n)
            }
            return bounds?.let { pkg to it }
        } finally {
            safeRecycle(root)
        }
    }

    private fun updateChatRoomOverlay() {
        val overlay = OverlayService.instance ?: return
        val chat = chatRoomInputBounds()
        if (chat != null) {
            foregroundPkg = chat.first
            overlay.showOverlay(chat.second)
            // Back with the keyboard open closes the keyboard first → treat that as "close the toolbar"
            val ime = isKeyboardVisible()
            if (lastImeVisible && !ime) overlay.collapseToolbar()
            lastImeVisible = ime
        } else {
            foregroundPkg = if (isSupportedAppInForeground()) foregroundPkg else null
            lastImeVisible = false
            overlay.hideOverlay()
            overlay.onLeftChatRoom()
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

    /** Tracks the focused message box (used by injectText / readInputFieldText). Visibility is NOT driven by focus. */
    private fun handleFocusEvent(node: AccessibilityNodeInfo, pkg: String) {
        val isEdit = node.className?.contains("EditText", true) == true
        val viewId = node.viewIdResourceName?.lowercase()
        if (!isEdit || (viewId != null && (viewId.contains("search") || viewId.contains("subject")))) {
            node.recycle()
            return
        }
        clearFocusedNode()
        focusedInputNode = node
        IndicContextModule.instance?.emitInputFocused(pkg, node.text?.toString() ?: "")
    }

    private fun onLeftSupportedApp() {
        if (isSupportedAppInForeground()) {
            return
        }
        contentCaptureDebounce?.let { mainHandler.removeCallbacks(it) }
        contentCaptureDebounce = null
        foregroundPkg = null
        lastImeVisible = false
        activeThreadTitle = null
        activeThreadId = null
        clearFocusedNode()
        OverlayService.instance?.hideOverlay(immediate = true)
        OverlayService.instance?.onLeftChatRoom()
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

    /** A message visible on screen in this capture pass. */
    private data class VisibleMessage(
        val text: String,
        val isSelf: Boolean?,
        val top: Int,
        val cls: String,
        val sentDate: String? = null,
        val sentTime: String? = null,
    )

    private fun isWhatsApp(pkg: String) = pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b"

    /**
     * Last-message day of each chat, read from WhatsApp's chat list
     * (`conversations_row_date`: "21:43" = today, "Yesterday", "1 October 2026").
     * Used to date the bottom of a chat when no date divider is on screen.
     */
    private data class ChatListDay(val dayIso: String, val capturedAtMs: Long)
    private val chatListDays = object : LinkedHashMap<String, ChatListDay>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ChatListDay>?) = size > 300
    }
    /** The chat-list anchor is only trusted if read shortly before the chat was opened. */
    private val CHAT_LIST_ANCHOR_TTL_MS = 10 * 60 * 1000L

    /**
     * Captures the messages currently on screen, in on-screen order, with a
     * resolved sender and send date/time, and merges them into the session buffer.
     *
     * Sender resolution (strict — unresolved stays null and is dropped in JS):
     *  1. WhatsApp: a row containing the delivery-tick `status` view is outgoing.
     *  2. Otherwise: bubble-container geometry (left gap vs right gap).
     *
     * Date resolution (WhatsApp):
     *  1. `conversation_row_date_divider` inside a row starts a new day for that row and below.
     *  2. No divider on screen + list scrolled to the bottom → the chat-list date of this chat.
     *  3. Otherwise SessionBuffer inherits from the message above when appending.
     *
     * @return number of buffer changes (added or updated messages).
     */
    private fun walkAndCapture(root: AccessibilityNodeInfo, pkg: String): Int {
        val visible: List<VisibleMessage> = if (isWhatsApp(pkg)) {
            val conv = collectWhatsAppConversation(root, pkg)
            if (conv == null) {
                // Not a conversation screen (chat list, settings, …): never scrape it as messages.
                recordChatListDays(root, pkg)
                return 0
            }
            conv
        } else {
            collectByGeometry(root, pkg)
        }
        if (visible.isEmpty()) return 0

        val ordered = visible.sortedBy { it.top }
        for (m in ordered) {
            val tag = when (m.isSelf) { true -> "user"; false -> "contact"; null -> "?" }
            Log.d(TAG, "capture [$tag] [${m.sentDate ?: "?"} ${m.sentTime ?: "?"}] ${m.text.take(40)}")
        }
        return buffer.mergeVisible(ordered.map {
            ChatBubble(
                text = it.text, isSelf = it.isSelf, nodeClassName = it.cls, appPackage = pkg,
                sentDate = it.sentDate, sentTime = it.sentTime,
            )
        })
    }

    /** Records each chat-list row's last-message day, keyed by the contact/group name. */
    private fun recordChatListDays(root: AccessibilityNodeInfo, pkg: String) {
        val names = try { root.findAccessibilityNodeInfosByViewId("$pkg:id/conversations_row_contact_name") } catch (e: Exception) { null }
        if (names.isNullOrEmpty()) return
        val now = System.currentTimeMillis()
        for (nameNode in names) {
            try {
                val name = nameNode.text?.toString()?.trim().orEmpty()
                if (name.isEmpty()) continue
                // name → header row → row content; the date sits in the header row next to the name
                val chain = ancestors(nameNode, 4)
                try {
                    val label = chain.asSequence()
                        .mapNotNull { a -> firstText(a, "$pkg:id/conversations_row_date") }
                        .firstOrNull()
                    ChatDates.resolveDayLabel(label, now)?.let { chatListDays[name] = ChatListDay(it, now) }
                } finally {
                    chain.forEach { safeRecycle(it) }
                }
            } finally {
                safeRecycle(nameNode)
            }
        }
    }

    private fun firstText(node: AccessibilityNodeInfo, viewId: String): String? {
        val found = try { node.findAccessibilityNodeInfosByViewId(viewId) } catch (e: Exception) { null } ?: return null
        val text = found.firstOrNull()?.text?.toString()?.trim()
        found.forEach { safeRecycle(it) }
        return text?.takeIf { it.isNotEmpty() }
    }

    /**
     * Row-based capture of an open WhatsApp conversation (verified on WhatsApp 2.26:
     * `android:id/list` › `conversation_row_*` rows › `message_text` / `caption`,
     * `date` (time), `status` (outgoing only), `conversation_row_date_divider`).
     * Returns null when the screen is not a conversation.
     */
    private fun collectWhatsAppConversation(root: AccessibilityNodeInfo, pkg: String): List<VisibleMessage>? {
        val header = try { root.findAccessibilityNodeInfosByViewId("$pkg:id/conversation_contact_name") } catch (e: Exception) { null }
        val isConversation = !header.isNullOrEmpty()
        header?.forEach { safeRecycle(it) }
        if (!isConversation) return null

        val lists = try { root.findAccessibilityNodeInfosByViewId("android:id/list") } catch (e: Exception) { null } ?: return emptyList()
        val list = lists.firstOrNull { isListContainer(it) }
        lists.forEach { if (it !== list) safeRecycle(it) }
        if (list == null) return emptyList()

        val now = System.currentTimeMillis()
        val out = ArrayList<VisibleMessage>()
        var sawDivider = false
        var currentDay: String? = null
        val atBottom = try {
            list.actionList.none { it.id == AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD.id }
        } catch (e: Exception) { false }

        try {
            for (i in 0 until list.childCount) {
                val row = list.getChild(i) ?: continue
                try {
                    firstText(row, "$pkg:id/conversation_row_date_divider")?.let { label ->
                        sawDivider = true
                        currentDay = ChatDates.resolveDayLabel(label, now)
                    }
                    out.addAll(collectRowMessages(row, pkg, currentDay))
                } finally {
                    safeRecycle(row)
                }
            }
        } finally {
            safeRecycle(list)
        }

        // No divider on screen at all and we're at the newest message: everything visible
        // is from the same day as the chat's last message, which the chat list told us.
        if (!sawDivider && atBottom && out.isNotEmpty()) {
            val anchor = activeThreadTitle?.let { chatListDays[it] }
                ?.takeIf { now - it.capturedAtMs < CHAT_LIST_ANCHOR_TTL_MS }
            if (anchor != null) {
                Log.d(TAG, "dating visible messages from chat list: ${anchor.dayIso}")
                return out.map { it.copy(sentDate = anchor.dayIso) }
            }
        }
        return out
    }

    private fun collectRowMessages(row: AccessibilityNodeInfo, pkg: String, day: String?): List<VisibleMessage> {
        val nodes = ArrayList<AccessibilityNodeInfo>()
        for (id in arrayOf("message_text", "caption")) {
            try { row.findAccessibilityNodeInfosByViewId("$pkg:id/$id") } catch (e: Exception) { null }?.let { nodes.addAll(it) }
        }
        if (nodes.isEmpty()) return emptyList()

        val out = ArrayList<VisibleMessage>()
        val bounds = Rect()
        // Row-level facts (a row is one message bubble)
        val isOutgoing = hasViewIdOutsideQuote(row, "$pkg:id/status")
        val time = textOutsideQuote(row, "$pkg:id/date")?.let { ChatDates.normalizeTime(it) }

        for (node in nodes) {
            try {
                val text = node.text?.toString()?.trim().orEmpty()
                if (text.isEmpty() || isMessagePlaceholder(text)) continue
                node.getBoundsInScreen(bounds)
                if (bounds.height() <= 0) continue
                val chain = ancestorsUntil(node, row)
                try {
                    // Quoted-reply snippets live inside a "quoted…" container — not a message of their own
                    if (chain.any { isQuoteContainer(it) }) continue
                    val isSelf = if (isOutgoing) true else senderFromGeometry(node, chain)
                    out.add(VisibleMessage(text, isSelf, bounds.top, node.className?.toString() ?: "", day, time))
                } finally {
                    chain.forEach { safeRecycle(it) }
                }
            } finally {
                safeRecycle(node)
            }
        }
        return out
    }

    private fun isQuoteContainer(n: AccessibilityNodeInfo) =
        n.viewIdResourceName?.contains("quoted", ignoreCase = true) == true

    /** Ancestors of [node] strictly below [stop] (nearest first). */
    private fun ancestorsUntil(node: AccessibilityNodeInfo, stop: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
        val out = ArrayList<AccessibilityNodeInfo>()
        var cur = try { node.parent } catch (e: Exception) { null }
        while (cur != null && cur != stop && out.size < 12) {
            out.add(cur)
            cur = try { cur.parent } catch (e: Exception) { null }
        }
        cur?.let { safeRecycle(it) }
        return out
    }

    private fun matchesOutsideQuote(row: AccessibilityNodeInfo, viewId: String): AccessibilityNodeInfo? {
        val found = try { row.findAccessibilityNodeInfosByViewId(viewId) } catch (e: Exception) { null } ?: return null
        var hit: AccessibilityNodeInfo? = null
        for (n in found) {
            if (hit == null) {
                val chain = ancestorsUntil(n, row)
                val quoted = chain.any { isQuoteContainer(it) }
                chain.forEach { safeRecycle(it) }
                if (!quoted) { hit = n; continue }
            }
            safeRecycle(n)
        }
        return hit
    }

    private fun hasViewIdOutsideQuote(row: AccessibilityNodeInfo, viewId: String): Boolean =
        matchesOutsideQuote(row, viewId)?.also { safeRecycle(it) } != null

    private fun textOutsideQuote(row: AccessibilityNodeInfo, viewId: String): String? =
        matchesOutsideQuote(row, viewId)?.let { n -> n.text?.toString().also { safeRecycle(n) } }

    /** Fallback for apps/versions where message view IDs are unknown. */
    private fun collectByGeometry(root: AccessibilityNodeInfo, pkg: String): List<VisibleMessage> {
        val headerMaxY = (90 * resources.displayMetrics.density).toInt()
        val bounds = Rect()
        val out = ArrayList<VisibleMessage>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            val cls = node.className?.toString() ?: ""
            val text = node.text?.toString()?.trim().orEmpty()
            if (text.isNotEmpty() && cls.endsWith("TextView") && !isNoiseText(text)) {
                node.getBoundsInScreen(bounds)
                if (bounds.bottom > headerMaxY && bounds.height() > 0) {
                    val chain = ancestors(node, 6)
                    try {
                        out.add(VisibleMessage(text, senderFromGeometry(node, chain), bounds.top, cls))
                    } finally {
                        chain.forEach { safeRecycle(it) }
                    }
                }
            }
            for (i in 0 until node.childCount) node.getChild(i)?.let { queue.add(it) }
            if (node !== root) safeRecycle(node)
        }
        return out
    }

    /**
     * Decides the sender from where the message bubble sits horizontally.
     * Uses the outermost ancestor that is still narrower than the screen (the
     * bubble), not the TextView, so long messages are classified correctly.
     * Returns null when the bubble is roughly centred (ambiguous).
     */
    private fun senderFromGeometry(node: AccessibilityNodeInfo, ancestorsBelowRow: List<AccessibilityNodeInfo>): Boolean? {
        val screenW = resources.displayMetrics.widthPixels
        val b = Rect()
        val bubble = Rect()
        node.getBoundsInScreen(bubble)
        for (a in ancestorsBelowRow) {
            a.getBoundsInScreen(b)
            if (b.width() < screenW * 0.92f && b.contains(bubble)) bubble.set(b) else if (b.width() >= screenW * 0.92f) break
        }
        val leftGap = bubble.left
        val rightGap = screenW - bubble.right
        val margin = screenW * 0.06f
        return when {
            leftGap - rightGap > margin -> true    // hugs the right edge → sent by user
            rightGap - leftGap > margin -> false   // hugs the left edge → from contact
            else -> null
        }
    }

    private fun ancestors(node: AccessibilityNodeInfo, max: Int): List<AccessibilityNodeInfo> {
        val out = ArrayList<AccessibilityNodeInfo>(max)
        var cur = try { node.parent } catch (e: Exception) { null }
        while (cur != null && out.size < max) {
            out.add(cur)
            cur = try { cur.parent } catch (e: Exception) { null }
        }
        cur?.let { safeRecycle(it) }
        return out
    }

    private fun isListContainer(n: AccessibilityNodeInfo): Boolean {
        val cls = n.className?.toString() ?: ""
        return cls.endsWith("RecyclerView") || cls.endsWith("ListView") || n.viewIdResourceName == "android:id/list"
    }

    private fun safeRecycle(n: AccessibilityNodeInfo) {
        try { n.recycle() } catch (e: Exception) {}
    }

    private val TIMESTAMP_ONLY = Regex("""^\d{1,2}[:.]\d{2}\s*([aApP]\.?[mM]\.?)?$""")
    private val DATE_CHIP = Regex(
        """^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|""" +
            """\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|""" +
            """\d{1,2} [a-z]+ \d{4}|[a-z]+ \d{1,2}, \d{4})$""",
        RegexOption.IGNORE_CASE,
    )
    /** Placeholders that can appear inside a real message bubble. */
    private val MESSAGE_PLACEHOLDER = Regex(
        """^(this message was deleted|you deleted this message|waiting for this message.*)$""",
        RegexOption.IGNORE_CASE,
    )
    /** Screen chrome picked up only by the geometry fallback. */
    private val SCREEN_CHROME = Regex(
        """(end-to-end encrypted|^\d+ unread messages?$|^typing…?$|^online$|^last seen )""",
        RegexOption.IGNORE_CASE,
    )

    private fun normalizeSpaces(raw: String) = raw.replace('\u202F', ' ').replace('\u00A0', ' ').trim()

    /** For text taken from a known message view: only deleted/pending placeholders are noise. */
    private fun isMessagePlaceholder(raw: String): Boolean = MESSAGE_PLACEHOLDER.matches(normalizeSpaces(raw))

    /** For arbitrary TextViews (geometry fallback): also drop timestamps, date chips and screen chrome. */
    private fun isNoiseText(raw: String): Boolean {
        val t = normalizeSpaces(raw)
        return MESSAGE_PLACEHOLDER.matches(t) || TIMESTAMP_ONLY.matches(t) || DATE_CHIP.matches(t) ||
            SCREEN_CHROME.containsMatchIn(t)
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
            if (!text.isNullOrBlank()) {
                lastKnownInputText = text
                return text
            }
        } catch (e: Exception) {}

        // Fallback: search tree for active or fallback EditText
        val active = findActiveEditText()
        if (active != null) {
            val t = active.text?.toString()
            if (!t.isNullOrBlank()) {
                lastKnownInputText = t
                if (focusedInputNode == null) {
                    focusedInputNode = active
                } else if (focusedInputNode !== active) {
                    try { active.recycle() } catch (e: Exception) {}
                }
                return t
            }
        }

        if (lastKnownInputText.isNotBlank()) {
            return lastKnownInputText
        }
        return null
    }

    fun injectText(text: String): Boolean {
        lastKnownInputText = text
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
