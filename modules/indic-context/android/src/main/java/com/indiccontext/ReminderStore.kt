package com.indiccontext

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Saved deadline reminders (SharedPreferences JSON).
 *
 * Privacy: only the reminder itself is stored (short task text, chat name, times),
 * never message history. Also keeps a bounded set of message keys already analysed,
 * so each chat message is sent to the AI at most once.
 */
object ReminderStore {
    private const val PREFS = "convoai_reminders"
    private const val KEY_LIST = "reminders"
    private const val KEY_CLAIMED = "claimed_keys"
    private const val KEY_AUTO = "auto_detect"
    private const val KEY_LEAD = "lead_minutes"
    private const val MAX_CLAIMED = 500
    private const val KEEP_FINISHED_MS = 7L * 24 * 60 * 60 * 1000

    const val STATUS_ACTIVE = "active"
    const val STATUS_DONE = "done"

    data class Reminder(
        val id: String,
        val task: String,
        val chat: String,
        val appPackage: String,
        val dueAtMs: Long,
        val dueHasTime: Boolean,
        val remindAtMs: Long,
        val status: String,
        val createdAtMs: Long,
        val sourceKey: String,
        val notified: Boolean = false,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("id", id).put("task", task).put("chat", chat).put("appPackage", appPackage)
            .put("dueAtMs", dueAtMs).put("dueHasTime", dueHasTime).put("remindAtMs", remindAtMs)
            .put("status", status).put("createdAtMs", createdAtMs).put("sourceKey", sourceKey)
            .put("notified", notified)

        fun toMap(): Map<String, Any?> = mapOf(
            "id" to id, "task" to task, "chat" to chat, "appPackage" to appPackage,
            "dueAtMs" to dueAtMs.toDouble(), "dueHasTime" to dueHasTime, "remindAtMs" to remindAtMs.toDouble(),
            "status" to status, "createdAtMs" to createdAtMs.toDouble(), "notified" to notified,
        )

        companion object {
            fun fromJson(o: JSONObject) = Reminder(
                id = o.getString("id"), task = o.optString("task"), chat = o.optString("chat"),
                appPackage = o.optString("appPackage", "com.whatsapp"), dueAtMs = o.getLong("dueAtMs"),
                dueHasTime = o.optBoolean("dueHasTime", true), remindAtMs = o.getLong("remindAtMs"),
                status = o.optString("status", STATUS_ACTIVE), createdAtMs = o.optLong("createdAtMs"),
                sourceKey = o.optString("sourceKey"), notified = o.optBoolean("notified", false),
            )
        }
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun all(ctx: Context): List<Reminder> {
        val raw = prefs(ctx).getString(KEY_LIST, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i -> runCatching { Reminder.fromJson(arr.getJSONObject(i)) }.getOrNull() }
        } catch (e: Exception) { emptyList() }
    }

    @Synchronized
    private fun save(ctx: Context, list: List<Reminder>) {
        val now = System.currentTimeMillis()
        // Drop finished items after a week and active ones a day after their deadline
        val kept = list.filter {
            if (it.status == STATUS_ACTIVE) ReminderTimes.effectiveDue(it.dueAtMs, it.dueHasTime) > now - 24 * 3600_000L
            else it.createdAtMs > now - KEEP_FINISHED_MS
        }
        val arr = JSONArray().apply { kept.forEach { put(it.toJson()) } }
        prefs(ctx).edit().putString(KEY_LIST, arr.toString()).apply()
    }

    fun active(ctx: Context): List<Reminder> = all(ctx).filter { it.status == STATUS_ACTIVE }.sortedBy { it.remindAtMs }

    fun get(ctx: Context, id: String): Reminder? = all(ctx).firstOrNull { it.id == id }

    /**
     * Adds a reminder unless an active one for the same message + task already exists.
     * Returns the stored reminder, or null if the deadline can't be reminded any more.
     */
    @Synchronized
    fun add(ctx: Context, task: String, chat: String, appPackage: String, dueAtMs: Long, dueHasTime: Boolean, sourceKey: String): Reminder? {
        val now = System.currentTimeMillis()
        val remindAt = ReminderTimes.remindAt(dueAtMs, dueHasTime, leadMinutes(ctx), now) ?: return null
        val list = all(ctx)
        list.firstOrNull { it.status == STATUS_ACTIVE && it.sourceKey == sourceKey && it.task.equals(task, true) }?.let { return it }
        val r = Reminder(UUID.randomUUID().toString(), task.take(80), chat, appPackage, dueAtMs, dueHasTime, remindAt, STATUS_ACTIVE, now, sourceKey)
        save(ctx, list + r)
        return r
    }

    @Synchronized
    fun update(ctx: Context, r: Reminder) = save(ctx, all(ctx).map { if (it.id == r.id) r else it })

    @Synchronized
    fun remove(ctx: Context, id: String) = save(ctx, all(ctx).filterNot { it.id == id })

    /** Returns the keys never analysed before, and marks them all as analysed (bounded LRU). */
    @Synchronized
    fun claim(ctx: Context, keys: List<String>): List<String> {
        val existing = prefs(ctx).getString(KEY_CLAIMED, null)?.let { raw ->
            runCatching { JSONArray(raw).let { a -> (0 until a.length()).map { a.getString(it) } } }.getOrNull()
        } ?: emptyList()
        val set = LinkedHashSet(existing)
        val fresh = keys.distinct().filter { it !in set }
        set.addAll(fresh)
        val trimmed = set.toList().takeLast(MAX_CLAIMED)
        prefs(ctx).edit().putString(KEY_CLAIMED, JSONArray(trimmed).toString()).apply()
        return fresh
    }

    /** Releases claimed keys (e.g. the AI call failed on a network error) so they're retried later. */
    fun unclaim(ctx: Context, keys: List<String>) {
        val raw = prefs(ctx).getString(KEY_CLAIMED, null) ?: return
        val list = runCatching { JSONArray(raw).let { a -> (0 until a.length()).map { a.getString(it) } } }.getOrNull() ?: return
        val drop = keys.toSet()
        prefs(ctx).edit().putString(KEY_CLAIMED, JSONArray(list.filter { it !in drop }).toString()).apply()
    }

    fun autoDetect(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_AUTO, true)
    fun leadMinutes(ctx: Context): Int = prefs(ctx).getInt(KEY_LEAD, 30)

    fun setSettings(ctx: Context, autoDetect: Boolean, leadMinutes: Int) {
        prefs(ctx).edit().putBoolean(KEY_AUTO, autoDetect).putInt(KEY_LEAD, leadMinutes.coerceIn(0, 24 * 60)).apply()
    }
}
