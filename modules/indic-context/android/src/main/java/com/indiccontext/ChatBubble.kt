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
     * true  → sent by the local user (outgoing).
     * false → received from the contact (incoming).
     * null  → sender could not be resolved; JS drops these before calling the LLM.
     */
    val isSelf: Boolean?,

    /** System.currentTimeMillis() at the moment this bubble was first captured. */
    val capturedAtMs: Long = System.currentTimeMillis(),

    /** Android node class name, e.g. "android.widget.TextView". */
    val nodeClassName: String? = null,

    /** Package name of the host chat application, e.g. "com.whatsapp". */
    val appPackage: String,

    /**
     * Day the message was sent, `yyyy-MM-dd`, resolved from WhatsApp's date
     * dividers / chat-list date at capture time. null = not determinable yet.
     */
    val sentDate: String? = null,

    /** Time the message was sent, `HH:mm` (24h), from the bubble's time label. */
    val sentTime: String? = null,
) {
    /**
     * Key used to line up on-screen messages with buffered ones when merging.
     * Sender is deliberately excluded so a message whose sender was resolved
     * on a later pass still matches (and gets its isSelf upgraded).
     */
    val matchKey: String get() = "$appPackage|$text"
}
