package com.indiccontext

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Finishes a share to WhatsApp for the chat that was open when the user tapped
 * 📤 Send: selects that chat in WhatsApp's "Send to…" picker and taps send.
 *
 * Picker layout verified on WhatsApp 2.26 (redacted dump, 2026-11-03):
 *   contact_picker_layout › android:id/list › RadioButton rows (checkable, not clickable)
 *     › contactpicker_row_name;   after selection: footer › `send` ImageButton ("Send").
 *
 * Safety rules — any doubt aborts and leaves the picker to the user:
 *  - the row name must equal the open chat's title EXACTLY (after whitespace/bidi cleanup);
 *  - send is only tapped when exactly ONE row is checked and it is that chat;
 *  - the whole run gives up after [TIMEOUT_MS].
 */
class WhatsAppAutoSender(private val service: AccessibilityService) {

    private enum class Stage { PICK, SEND, CONFIRM }

    private class Job(
        val target: String,
        val pkg: String,
        val deadline: Long,
        val onDone: (Boolean, String) -> Unit,
    ) {
        var stage = Stage.PICK
        var stageSince = System.currentTimeMillis()
        var pickerSeenTicks = 0
        var previewSendClicked = false
    }

    companion object {
        private const val TAG = "AutoSend"
        private const val TICK_MS = 250L
        private const val TIMEOUT_MS = 10_000L
        private const val SELECT_SETTLE_MS = 2_000L
        private const val CONFIRM_WINDOW_MS = 2_500L

        fun normalize(s: CharSequence?): String =
            (s?.toString() ?: "").replace(Regex("[\\u200E\\u200F\\u202A-\\u202E]"), "")
                .replace(Regex("\\s+"), " ").trim()
    }

    private val main = Handler(Looper.getMainLooper())
    private var job: Job? = null
    private val tick = Runnable { step() }

    val isActive: Boolean get() = job != null

    fun start(targetTitle: String, pkg: String, onDone: (Boolean, String) -> Unit) {
        cancel()
        job = Job(normalize(targetTitle), pkg, System.currentTimeMillis() + TIMEOUT_MS, onDone)
        Log.i(TAG, "armed for '$targetTitle' in $pkg")
        main.postDelayed(tick, TICK_MS)
    }

    fun cancel() {
        main.removeCallbacks(tick)
        job = null
    }

    private fun finish(ok: Boolean, msg: String) {
        val j = job ?: return
        cancel()
        Log.i(TAG, "done ok=$ok: $msg")
        j.onDone(ok, msg)
    }

    private fun next(stage: Stage) {
        job?.let { it.stage = stage; it.stageSince = System.currentTimeMillis() }
    }

    private fun step() {
        val j = job ?: return
        val now = System.currentTimeMillis()
        if (now > j.deadline) {
            finish(false, "Couldn't finish automatically. Pick the chat and tap send.")
            return
        }
        val root = try { service.rootInActiveWindow } catch (e: Exception) { null }
        try {
            if (root != null && root.packageName?.toString() == j.pkg) {
                when (j.stage) {
                    Stage.PICK -> stepPick(j, root)
                    Stage.SEND -> stepSend(j, root)
                    Stage.CONFIRM -> stepConfirm(j, root)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "step error: ${e.message}")
        } finally {
            try { root?.recycle() } catch (_: Exception) {}
        }
        if (job != null) main.postDelayed(tick, TICK_MS)
    }

    private fun pickerRows(root: AccessibilityNodeInfo, pkg: String): List<Pair<String, AccessibilityNodeInfo>> {
        val names = root.findAccessibilityNodeInfosByViewId("$pkg:id/contactpicker_row_name") ?: return emptyList()
        return names.mapNotNull { nameNode ->
            val row = checkableAncestor(nameNode)
            val name = normalize(nameNode.text)
            if (row == null) null else name to row
        }
    }

    private fun checkableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var cur: AccessibilityNodeInfo? = node.parent
        var depth = 0
        while (cur != null && depth < 6) {
            if (cur.isCheckable) return cur
            cur = cur.parent
            depth++
        }
        return null
    }

    private fun stepPick(j: Job, root: AccessibilityNodeInfo) {
        val rows = pickerRows(root, j.pkg)
        if (rows.isEmpty()) return // picker not on screen yet
        j.pickerSeenTicks++
        val match = rows.firstOrNull { it.first == j.target }
        if (match == null) {
            // Give the list a moment to populate before giving up
            if (j.pickerSeenTicks >= 6) finish(false, "Couldn't find “${j.target}” in WhatsApp's list. Pick it and tap send.")
            return
        }
        val row = match.second
        if (!row.isChecked) {
            val clicked = row.performAction(AccessibilityNodeInfo.ACTION_CLICK) || tapCenter(row)
            Log.d(TAG, "select '${j.target}': clicked=$clicked")
            if (!clicked) {
                finish(false, "Couldn't select the chat automatically. Pick it and tap send.")
                return
            }
        }
        next(Stage.SEND)
    }

    private fun stepSend(j: Job, root: AccessibilityNodeInfo) {
        val checked = pickerRows(root, j.pkg).filter { it.second.isChecked }
        val onlyTarget = checked.size == 1 && checked[0].first == j.target
        if (!onlyTarget) {
            if (System.currentTimeMillis() - j.stageSince > SELECT_SETTLE_MS) {
                finish(false, "Selection didn't match the open chat. Check it and tap send.")
            }
            return
        }
        val send = root.findAccessibilityNodeInfosByViewId("${j.pkg}:id/send")?.firstOrNull { it.isEnabled && it.isVisibleToUser }
            ?: return
        if (send.performAction(AccessibilityNodeInfo.ACTION_CLICK) || tapCenter(send)) {
            next(Stage.CONFIRM)
        }
    }

    /** Some WhatsApp versions confirm audio shares with a "Send to …?" dialog. */
    private fun stepConfirm(j: Job, root: AccessibilityNodeInfo) {
        val positive = root.findAccessibilityNodeInfosByViewId("android:id/button1")?.firstOrNull()
        if (positive != null && Regex("(?i)^\\s*send\\s*$").matches(positive.text ?: "")) {
            positive.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            finish(true, "Sent to ${j.target}")
            return
        }
        val pickerGone = root.findAccessibilityNodeInfosByViewId("${j.pkg}:id/contactpicker_row_name").isNullOrEmpty()
        if (pickerGone) {
            // Media shares can land on a preview screen with its own send button (same, verified recipient)
            val previewSend = root.findAccessibilityNodeInfosByViewId("${j.pkg}:id/send")
                ?.firstOrNull { it.isEnabled && it.isVisibleToUser }
            if (previewSend != null && !j.previewSendClicked) {
                j.previewSendClicked = previewSend.performAction(AccessibilityNodeInfo.ACTION_CLICK) || tapCenter(previewSend)
                return
            }
            finish(true, "Sent to ${j.target}")
        } else if (System.currentTimeMillis() - j.stageSince > CONFIRM_WINDOW_MS) {
            finish(false, "WhatsApp is still waiting. Tap send to finish.")
        }
    }

    /** Fallback for rows that don't accept ACTION_CLICK (needs canPerformGestures). */
    private fun tapCenter(node: AccessibilityNodeInfo): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val r = Rect()
        node.getBoundsInScreen(r)
        if (r.isEmpty) return false
        val path = Path().apply { moveTo(r.exactCenterX(), r.exactCenterY()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        return try {
            service.dispatchGesture(gesture, null, null)
        } catch (e: Exception) {
            Log.w(TAG, "dispatchGesture failed: ${e.message}")
            false
        }
    }
}
