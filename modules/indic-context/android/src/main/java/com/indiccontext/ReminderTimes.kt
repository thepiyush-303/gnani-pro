package com.indiccontext

import java.util.Calendar
import java.util.TimeZone

/**
 * Pure rules for WHEN a reminder fires (unit-tested in ReminderTimesTest).
 *
 *  - Timed deadline ("by 6:00 PM"): due − lead minutes. If that moment has already
 *    passed but the deadline hasn't, fire in [SOON_MS] (e.g. "update me by 6" read at 5:45).
 *  - Date-only deadline ("by Monday", "kal tak"): 9:00 on the due day. If 9:00 already
 *    passed on that day, 18:00; if that passed too, no reminder.
 *  - Deadline already in the past: no reminder (null).
 */
object ReminderTimes {
    const val SOON_MS = 60_000L
    const val DATE_ONLY_MORNING_HOUR = 9
    const val DATE_ONLY_EVENING_HOUR = 18

    fun remindAt(
        dueAtMs: Long,
        dueHasTime: Boolean,
        leadMinutes: Int,
        nowMs: Long,
        zone: TimeZone = TimeZone.getDefault(),
    ): Long? {
        if (dueHasTime) {
            if (dueAtMs <= nowMs) return null
            val wanted = dueAtMs - leadMinutes * 60_000L
            return if (wanted > nowMs) wanted else nowMs + SOON_MS
        }
        val morning = atHour(dueAtMs, DATE_ONLY_MORNING_HOUR, zone)
        if (morning > nowMs) return morning
        val evening = atHour(dueAtMs, DATE_ONLY_EVENING_HOUR, zone)
        if (evening > nowMs) return evening
        return null
    }

    /** End of the deadline used for expiry: the timed moment, or 23:59 on a date-only day. */
    fun effectiveDue(dueAtMs: Long, dueHasTime: Boolean, zone: TimeZone = TimeZone.getDefault()): Long =
        if (dueHasTime) dueAtMs else atHour(dueAtMs, 23, zone) + 59 * 60_000L

    fun atHour(dayMs: Long, hour: Int, zone: TimeZone = TimeZone.getDefault()): Long =
        Calendar.getInstance(zone).apply {
            timeInMillis = dayMs
            set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
}
