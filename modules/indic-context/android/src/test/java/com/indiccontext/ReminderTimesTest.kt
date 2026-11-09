package com.indiccontext

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class ReminderTimesTest {
    private val tz = TimeZone.getTimeZone("Asia/Kolkata")
    private fun at(day: Int, hour: Int, minute: Int = 0): Long =
        Calendar.getInstance(tz).apply { clear(); set(2026, Calendar.NOVEMBER, day, hour, minute) }.timeInMillis
    private fun remind(due: Long, timed: Boolean, lead: Int, now: Long) = ReminderTimes.remindAt(due, timed, lead, now, tz)

    @Test fun timedDeadlineUsesLeadTime() {
        // "Update me by 6:00 PM", read at 2 PM, lead 30 → 5:30 PM
        assertEquals(at(9, 17, 30), remind(at(9, 18), true, 30, at(9, 14)))
    }

    @Test fun lateDetectionStillRemindsSoon() {
        // read at 5:45 PM, lead 30 → lead moment passed, deadline not → in 1 minute
        val now = at(9, 17, 45)
        assertEquals(now + ReminderTimes.SOON_MS, remind(at(9, 18), true, 30, now))
    }

    @Test fun pastTimedDeadlineIsSkipped() {
        assertNull(remind(at(9, 18), true, 30, at(9, 18, 1)))
    }

    @Test fun dateOnlyRemindsAtNineAm() {
        // "review by Monday" (Mon 16 Nov), said on Sun → Mon 9:00
        assertEquals(at(16, 9), remind(at(16, 0), false, 30, at(15, 20)))
    }

    @Test fun dateOnlyTodayAfterNineFallsBackToSixPm() {
        assertEquals(at(9, 18), remind(at(9, 0), false, 30, at(9, 11)))
    }

    @Test fun dateOnlyTodayAfterSixIsSkipped() {
        assertNull(remind(at(9, 0), false, 30, at(9, 19)))
    }

    @Test fun effectiveDueForDateOnlyIsEndOfDay() {
        assertEquals(at(16, 23, 59), ReminderTimes.effectiveDue(at(16, 0), false, tz))
    }
}
