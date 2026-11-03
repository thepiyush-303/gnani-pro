package com.indiccontext

import android.util.Log

/**
 * In-Memory Session Buffer — the core context store for IndicContext Assistant.
 *
 * This is a bounded ring-buffer (FIFO) that holds the last [MAX_CAPACITY] chat
 * bubbles visible on screen. It is the only form of storage used — no data is
 * ever written to disk.
 *
 * ## Thread Safety
 * All public methods are @Synchronized. [ChatAccessibilityService] writes from
 * Android's main thread; the NativeModule reads from a background thread.
 *
 * ## Session Boundary
 * Call [resetIfAppChanged] on every accessibility event. When the package name
 * changes (user switches apps or chat threads), the buffer is cleared so that
 * stale context from one conversation never leaks into another.
 */
class SessionBuffer {

    private val deque = ArrayDeque<ChatBubble>(MAX_CAPACITY + 1)
    private var currentPackage: String? = null
    private var currentThreadId: String? = null

    companion object {
        /** Maximum number of chat bubbles retained in memory. */
        const val MAX_CAPACITY = 30
        private const val TAG = "SessionBuffer"
    }

    // ───────────────────────────────────────────────────────────────
    // Write
    // ───────────────────────────────────────────────────────────────

    /**
     * Merges the messages currently visible on screen ([visible], top → bottom)
     * into the buffer while keeping chronological order.
     *
     * 1. **New messages / same view** — find where the newest buffered messages
     *    appear on screen (longest matching run) and append everything below it.
     * 2. **Scrolled up** — if the oldest buffered message is on screen, prepend
     *    what is above it (only while there is spare capacity; never evict newer
     *    messages to make room for older ones).
     * 3. **No overlap** (jumped far / big burst) — the screen is the truth:
     *    replace the buffer with what is visible.
     *
     * Matched messages whose sender was unknown get upgraded if the screen now
     * resolves it.
     *
     * @return number of changes (added, replaced, or re-attributed bubbles).
     */
    @Synchronized
    fun mergeVisible(visible: List<ChatBubble>): Int {
        if (visible.isEmpty()) return 0
        if (deque.isEmpty()) {
            visible.takeLast(MAX_CAPACITY).forEach { deque.addLast(it) }
            return deque.size
        }

        val keys = visible.map { it.matchKey }
        val buffered = deque.map { it.matchKey }

        // ── 1. Anchor on the newest buffered message ──
        val tail = bestRunEndingAt(keys, buffered)
        if (tail != null) {
            val (endIdx, runLen) = tail
            val screenStart = endIdx - runLen + 1
            var changes = upgradeSenders(visible, screenStart, deque.size - runLen, runLen)

            // Whole buffer is on screen and older messages are visible above it → prepend them,
            // but only into capacity that the appends below won't need.
            if (runLen == deque.size && screenStart > 0) {
                val appendCount = visible.size - endIdx - 1
                var spare = MAX_CAPACITY - deque.size - appendCount
                var i = screenStart - 1
                while (i >= 0 && spare > 0) {
                    deque.addFirst(visible[i])
                    changes++
                    spare--
                    i--
                }
            }

            for (i in endIdx + 1 until visible.size) {
                if (deque.size >= MAX_CAPACITY) deque.removeFirst()
                deque.addLast(visible[i])
                changes++
            }
            if (changes > 0) Log.d(TAG, "merge(append) changes=$changes size=${deque.size}")
            return changes
        }

        // ── 2. Anchor on the oldest buffered message (user scrolled up) ──
        val head = bestRunStartingAt(keys, buffered)
        if (head != null) {
            val (startIdx, runLen) = head
            var changes = upgradeSenders(visible, startIdx, 0, runLen)
            var i = startIdx - 1
            while (i >= 0 && deque.size < MAX_CAPACITY) {
                deque.addFirst(visible[i])
                changes++
                i--
            }
            if (changes > 0) Log.d(TAG, "merge(prepend) changes=$changes size=${deque.size}")
            return changes
        }

        // ── 3. No overlap: screen is the source of truth ──
        deque.clear()
        visible.takeLast(MAX_CAPACITY).forEach { deque.addLast(it) }
        Log.d(TAG, "merge(replace) size=${deque.size}")
        return deque.size
    }

    /**
     * Finds the on-screen index where the buffer's newest message sits, choosing
     * the position with the longest run of buffered messages matching backwards.
     * @return (index in [screen], run length) or null when the newest buffered
     *         message is not on screen.
     */
    private fun bestRunEndingAt(screen: List<String>, buffered: List<String>): Pair<Int, Int>? {
        var best: Pair<Int, Int>? = null
        for (j in screen.indices) {
            var run = 0
            while (run <= j && run < buffered.size && screen[j - run] == buffered[buffered.size - 1 - run]) run++
            if (run > 0 && (best == null || run >= best.second)) best = j to run
        }
        return best
    }

    /** Mirror of [bestRunEndingAt] for the buffer's oldest message, matching forwards. */
    private fun bestRunStartingAt(screen: List<String>, buffered: List<String>): Pair<Int, Int>? {
        var best: Pair<Int, Int>? = null
        for (j in screen.indices.reversed()) {
            var run = 0
            while (j + run < screen.size && run < buffered.size && screen[j + run] == buffered[run]) run++
            if (run > 0 && (best == null || run >= best.second)) best = j to run
        }
        return best
    }

    /** Re-attributes buffered bubbles whose sender was null when the screen now knows it. */
    private fun upgradeSenders(visible: List<ChatBubble>, screenStart: Int, bufferStart: Int, len: Int): Int {
        var changes = 0
        for (k in 0 until len) {
            val old = deque[bufferStart + k]
            val fresh = visible[screenStart + k]
            if (old.isSelf == null && fresh.isSelf != null) {
                deque[bufferStart + k] = old.copy(isSelf = fresh.isSelf)
                changes++
            }
        }
        return changes
    }

    // ───────────────────────────────────────────────────────────────
    // Session boundary
    // ───────────────────────────────────────────────────────────────

    /**
     * Clears the buffer if the current front-of-screen app has changed.
     *
     * @param newPackage The package name of the app that just triggered an accessibility event.
     * @return true if the buffer was reset (app changed), false if it was the same app.
     */
    @Synchronized
    fun resetIfAppChanged(newPackage: String): Boolean {
        if (newPackage == currentPackage) return false
        Log.i(TAG, "App changed: $currentPackage → $newPackage. Clearing buffer.")
        currentPackage = newPackage
        currentThreadId = null
        clear()
        return true
    }

    /**
     * Clears the buffer if either the host app or the specific chat thread changed.
     * Prevents context leakage across distinct conversation threads within WhatsApp.
     */
    @Synchronized
    fun resetIfThreadChanged(newPackage: String, newThreadId: String?): Boolean {
        val appChanged = newPackage != currentPackage
        val threadChanged = newThreadId != null && currentThreadId != null && newThreadId != currentThreadId

        if (appChanged || threadChanged) {
            Log.i(TAG, "Thread boundary crossed: ($currentPackage, $currentThreadId) → ($newPackage, $newThreadId). Clearing buffer.")
            currentPackage = newPackage
            currentThreadId = newThreadId
            clear()
            return true
        }
        if (currentThreadId == null && newThreadId != null) {
            currentThreadId = newThreadId
        }
        return false
    }

    // ───────────────────────────────────────────────────────────────
    // Read
    // ───────────────────────────────────────────────────────────────

    /** Returns an immutable snapshot of the current buffer contents (oldest first). */
    @Synchronized
    fun snapshot(): List<ChatBubble> = deque.toList()

    /** Returns the current number of buffered bubbles. */
    @Synchronized
    fun size(): Int = deque.size

    /** Returns true if the buffer has no entries. */
    @Synchronized
    fun isEmpty(): Boolean = deque.isEmpty()

    // ───────────────────────────────────────────────────────────────
    // Lifecycle
    // ───────────────────────────────────────────────────────────────

    /** Clears all buffered bubbles. */
    @Synchronized
    fun clear() {
        deque.clear()
        Log.d(TAG, "Buffer cleared.")
    }
}
