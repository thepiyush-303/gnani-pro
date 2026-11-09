package com.indiccontext

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class ChatDatesTest {

    /** Tuesday 3 Nov 2026, 15:00 local. */
    private lateinit var now: Calendar

    @Before
    fun setUp() {
        Locale.setDefault(Locale.UK)
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"))
        now = Calendar.getInstance().apply { clear(); set(2026, Calendar.NOVEMBER, 3, 15, 0) }
    }

    private fun day(label: String) = ChatDates.resolveDayLabel(label, now.timeInMillis)

    @Test fun relativeLabels() {
        assertEquals("2026-11-03", day("Today"))
        assertEquals("2026-11-03", day("TODAY"))
        assertEquals("2026-11-02", day("Yesterday"))
        assertEquals("2026-11-03", day("आज"))
    }

    @Test fun chatListTimeMeansToday() {
        assertEquals("2026-11-03", day("21:43"))
        assertEquals("2026-11-03", day("9:05 am"))
    }

    @Test fun weekdaysAreWithinLastWeek() {
        assertEquals("2026-10-31", day("Saturday"))
        assertEquals("2026-11-01", day("Sunday"))
        // Today is Tuesday → "Tuesday" means a week ago, never today
        assertEquals("2026-10-27", day("Tuesday"))
    }

    @Test fun absoluteDatesSeenOnDevice() {
        assertEquals("2026-10-01", day("1 October 2026"))
        assertEquals("2025-12-25", day("25 December 2025"))
        assertEquals("2026-10-01", day("October 1, 2026"))
        assertEquals("2026-10-01", day("01/10/2026"))   // en-GB short form = d/M/y
    }

    @Test fun yearlessDatesAreInThePast() {
        assertEquals("2026-10-01", day("1 October"))
        assertEquals("2025-12-25", day("25 December"))
    }

    @Test fun garbageIsNull() {
        assertNull(day("hello there"))
        assertNull(day(""))
        assertNull(day("32 October 2026"))
    }

    @Test fun times() {
        assertEquals("20:56", ChatDates.normalizeTime("20:56"))
        assertEquals("20:56", ChatDates.normalizeTime("8:56 pm"))
        assertEquals("20:56", ChatDates.normalizeTime("8:56 PM"))
        assertEquals("00:15", ChatDates.normalizeTime("12:15 am"))
        assertEquals("12:15", ChatDates.normalizeTime("12:15 pm"))
        assertNull(ChatDates.normalizeTime("25:00"))
        assertNull(ChatDates.normalizeTime("meet at 10:30"))
    }

    @Test fun recentDayOnlyForJustSentMessages() {
        val n = now.timeInMillis // Tue 3 Nov 2026 15:00
        assertEquals("2026-11-03", ChatDates.recentDay("14:45", n))
        assertEquals("2026-11-03", ChatDates.recentDay("3:00 pm", n))
        assertEquals("2026-11-03", ChatDates.recentDay("15:01", n)) // clock drift
        assertNull(ChatDates.recentDay("14:00", n))  // an hour ago: could be any day
        assertNull(ChatDates.recentDay("15:30", n))  // future → yesterday 15:30, too old
        assertNull(ChatDates.recentDay(null, n))
        val justAfterMidnight = Calendar.getInstance().apply { clear(); set(2026, Calendar.NOVEMBER, 4, 0, 10) }.timeInMillis
        assertEquals("2026-11-03", ChatDates.recentDay("23:55", justAfterMidnight))
    }
}
