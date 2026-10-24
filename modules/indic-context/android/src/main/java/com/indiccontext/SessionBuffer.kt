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
    private val seenKeys = HashSet<String>(MAX_CAPACITY * 2)
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
     * Attempts to add [bubble] to the buffer.
     *
     * - Silently ignored if the same [ChatBubble.dedupeKey] already exists.
     * - If adding would exceed [MAX_CAPACITY], the oldest entry is evicted first.
     *
     * @return true if the bubble was added (i.e., it was new), false if it was a duplicate.
     */
    @Synchronized
    fun add(bubble: ChatBubble): Boolean {
        if (seenKeys.contains(bubble.dedupeKey)) {
            return false
        }
        if (deque.size >= MAX_CAPACITY) {
            val evicted = deque.removeFirst()
            seenKeys.remove(evicted.dedupeKey)
            Log.v(TAG, "Evicted oldest bubble: '${evicted.text.take(30)}...'")
        }
        deque.addLast(bubble)
        seenKeys.add(bubble.dedupeKey)
        Log.d(TAG, "Added bubble [size=${deque.size}]: '${bubble.text.take(40)}'")
        return true
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

    /** Clears all buffered bubbles and resets the seen-key deduplication set. */
    @Synchronized
    fun clear() {
        deque.clear()
        seenKeys.clear()
        Log.d(TAG, "Buffer cleared.")
    }
}
