package com.indiccontext

/**
 * Represents a single captured chat message bubble from the screen.
 *
 * Instances are captured by [ChatAccessibilityService] by walking the
 * AccessibilityNodeInfo tree and stored in [SessionBuffer].
 */
data class ChatBubble(
    /** The raw visible text of the bubble. */
    val text: String,

    /**
     * true  → this bubble was sent by the local user (right-aligned in most apps).
     * false → this bubble was received from the other party.
     * null  → could not be determined from the node tree (rare).
     */
    val isSelf: Boolean?,

    /** System.currentTimeMillis() at the moment this bubble was first captured. */
    val capturedAtMs: Long = System.currentTimeMillis(),

    /** Android node class name, e.g. "android.widget.TextView". */
    val nodeClassName: String? = null,

    /** Package name of the host chat application, e.g. "com.whatsapp". */
    val appPackage: String,
) {
    /**
     * A stable deduplication key.
     * Two bubbles with the same text and app package are considered the same
     * logical message (position-independent to survive scrolling).
     */
    val dedupeKey: String get() = "$appPackage|$isSelf|$text"
}
