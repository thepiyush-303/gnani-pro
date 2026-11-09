package com.indiccontext

import java.text.DateFormat
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Parses WhatsApp's on-screen day and time labels into absolute values.
 *
 * Labels are relative to the moment they are read ("Yesterday", "Saturday",
 * "21:43" in the chat list), so they are resolved at capture time and stored
 * as absolute `yyyy-MM-dd` / `HH:mm` strings.
 *
 * Formats seen on device (WhatsApp 2.26, en-GB, 24h): "Yesterday",
 * "1 October 2026", message times "20:56". Also handles 12h times
 * ("8:56 pm"), weekday names, US-style dates and Hindi "आज"/"कल".
 * Uses java.util APIs (minSdk 23 — no java.time).
 */
object ChatDates {

    private val ISO_DAY = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    private val TIME_RE = Regex("""^(\d{1,2})[:.](\d{2})\s*([aApP])?\.?\s*[mM]?\.?$""")

    private val WEEKDAYS = mapOf(
        "sunday" to Calendar.SUNDAY, "monday" to Calendar.MONDAY, "tuesday" to Calendar.TUESDAY,
        "wednesday" to Calendar.WEDNESDAY, "thursday" to Calendar.THURSDAY, "friday" to Calendar.FRIDAY,
        "saturday" to Calendar.SATURDAY,
    )

    private val FULL_PATTERNS = listOf("d MMMM yyyy", "MMMM d, yyyy", "d MMM yyyy", "MMM d, yyyy", "d MMM, yyyy")
    private val YEARLESS_PATTERNS = listOf("d MMMM", "MMMM d", "d MMM", "MMM d")

    private fun normalize(raw: String): String =
        raw.replace(' ', ' ').replace(' ', ' ').replace(Regex("\\s+"), " ").trim()

    private fun startOfDay(nowMs: Long, minusDays: Int = 0): Calendar =
        Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, -minusDays)
        }

    private fun iso(cal: Calendar): String = synchronized(ISO_DAY) { ISO_DAY.format(cal.time) }

    /** "20:56" / "8:56 pm" / "8.56 PM" → "HH:mm" (24h), else null. */
    fun normalizeTime(raw: String?): String? {
        if (raw == null) return null
        val m = TIME_RE.matchEntire(normalize(raw)) ?: return null
        var h = m.groupValues[1].toInt()
        val min = m.groupValues[2].toInt()
        val ampm = m.groupValues[3].lowercase()
        if (ampm == "p" && h < 12) h += 12
        if (ampm == "a" && h == 12) h = 0
        if (h !in 0..23 || min !in 0..59) return null
        return String.format(Locale.US, "%02d:%02d", h, min)
    }

    /**
     * Resolves a day label (date divider or chat-list date) to `yyyy-MM-dd`,
     * relative to [nowMs]. A bare time (chat list, last message today) → today.
     * Returns null for anything unrecognised.
     */
    fun resolveDayLabel(raw: String?, nowMs: Long = System.currentTimeMillis()): String? {
        if (raw.isNullOrBlank()) return null
        val label = normalize(raw)
        val lc = label.lowercase(Locale.ROOT)

        when (lc) {
            "today", "आज" -> return iso(startOfDay(nowMs))
            "yesterday", "कल" -> return iso(startOfDay(nowMs, 1))
        }
        if (normalizeTime(label) != null) return iso(startOfDay(nowMs))

        // Weekday names are used for the last week (excluding today/yesterday)
        WEEKDAYS[lc]?.let { target ->
            for (back in 1..7) {
                val c = startOfDay(nowMs, back)
                if (c.get(Calendar.DAY_OF_WEEK) == target) return iso(c)
            }
        }

        val today = startOfDay(nowMs)
        val locales = listOf(Locale.getDefault(), Locale.ENGLISH).distinct()

        // Device-locale numeric/short formats first (WhatsApp follows the device locale)
        for (loc in locales) {
            for (style in intArrayOf(DateFormat.SHORT, DateFormat.MEDIUM, DateFormat.LONG, DateFormat.FULL)) {
                parseStrict(DateFormat.getDateInstance(style, loc), label)?.let { return iso(it) }
            }
            for (p in FULL_PATTERNS) parseStrict(SimpleDateFormat(p, loc), label)?.let { return iso(it) }
            for (p in YEARLESS_PATTERNS) {
                val c = parseStrict(SimpleDateFormat(p, loc), label) ?: continue
                c.set(Calendar.YEAR, today.get(Calendar.YEAR))
                if (c.after(today)) c.add(Calendar.YEAR, -1)   // year-less dates are in the past
                return iso(c)
            }
        }
        return null
    }

    private fun parseStrict(fmt: DateFormat, text: String): Calendar? = try {
        fmt.isLenient = false
        val pos = java.text.ParsePosition(0)
        val d = fmt.parse(text, pos)
        if (d == null || pos.index != text.length) null
        else Calendar.getInstance().apply { time = d }
    } catch (e: ParseException) {
        null
    } catch (e: IllegalArgumentException) {
        null
    }

    fun todayIso(nowMs: Long = System.currentTimeMillis()): String = iso(startOfDay(nowMs))

    /**
     * Day of a message whose time ("HH:mm") is within the last [windowMinutes] of [nowMs],
     * else null. Used when no date divider is on screen: the newest message of a chat you're
     * reading right now was almost certainly just sent. Handles midnight ("23:55" at 00:10 → yesterday).
     * A time up to 2 min ahead of the phone clock (clock drift) counts as now.
     */
    fun recentDay(timeHHmm: String?, nowMs: Long = System.currentTimeMillis(), windowMinutes: Int = 30): String? {
        val t = normalizeTime(timeHHmm) ?: return null
        val (h, m) = t.split(":").map { it.toInt() }
        val cal = startOfDay(nowMs).apply { set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m) }
        if (cal.timeInMillis > nowMs + 2 * 60_000L) cal.add(Calendar.DAY_OF_YEAR, -1)
        val age = nowMs - cal.timeInMillis
        if (age > windowMinutes * 60_000L) return null
        return iso(startOfDay(cal.timeInMillis))
    }
}
