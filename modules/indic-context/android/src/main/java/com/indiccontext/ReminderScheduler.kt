package com.indiccontext

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Schedules reminder alarms. Uses an exact alarm when Android allows it
 * (SCHEDULE_EXACT_ALARM granted); otherwise an inexact one that may arrive a few
 * minutes late while the phone is idle.
 */
object ReminderScheduler {
    private const val TAG = "ReminderScheduler"

    private fun pending(ctx: Context, id: String, flags: Int): PendingIntent? {
        val intent = Intent(ctx, ReminderReceiver::class.java).apply {
            action = ReminderReceiver.ACTION_FIRE
            putExtra(ReminderReceiver.EXTRA_ID, id)
        }
        return PendingIntent.getBroadcast(ctx, id.hashCode(), intent, flags or PendingIntent.FLAG_IMMUTABLE)
    }

    fun canExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    }

    fun schedule(ctx: Context, r: ReminderStore.Reminder) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pending(ctx, r.id, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        val at = maxOf(r.remindAtMs, System.currentTimeMillis() + 5_000L)
        try {
            if (canExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            Log.i(TAG, "scheduled '${r.task}' at $at (exact=${canExact(ctx)})")
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun cancel(ctx: Context, id: String) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        pending(ctx, id, PendingIntent.FLAG_NO_CREATE)?.let { am.cancel(it); it.cancel() }
    }

    /** After boot / app update / lead-time change. */
    fun rescheduleAll(ctx: Context) {
        ReminderStore.active(ctx).filter { !it.notified }.forEach { schedule(ctx, it) }
    }
}
