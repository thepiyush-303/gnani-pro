package com.indiccontext

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.Calendar
import java.util.Date

/**
 * Reminder alarm → notification (✓ Done / ⏱ Snooze 15 min), notification actions,
 * and re-scheduling after reboot or app update.
 */
class ReminderReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ReminderReceiver"
        const val ACTION_FIRE = "com.indiccontext.REMINDER_FIRE"
        /** AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (API 31+) */
        const val ACTION_EXACT_ALARM_STATE = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
        const val ACTION_DONE = "com.indiccontext.REMINDER_DONE"
        const val ACTION_SNOOZE = "com.indiccontext.REMINDER_SNOOZE"
        const val EXTRA_ID = "reminder_id"
        const val CHANNEL_ID = "convoai_reminders"
        private const val SNOOZE_MS = 15 * 60_000L

        fun notificationId(id: String) = id.hashCode()

        /** "6:00 PM" / "18:00" following the phone's 12/24 h setting. */
        fun time(ctx: Context, ms: Long): String = android.text.format.DateFormat.getTimeFormat(ctx).format(Date(ms))

        /** "today" / "tomorrow" / "Mon 17 Nov". */
        fun day(ms: Long): String {
            val d = Calendar.getInstance().apply { timeInMillis = ms }
            val today = Calendar.getInstance()
            val diff = ((ReminderTimes.atHour(ms, 0) - ReminderTimes.atHour(today.timeInMillis, 0)) / 86_400_000L).toInt()
            return when (diff) {
                0 -> "today"
                1 -> "tomorrow"
                else -> java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(d.time)
            }
        }

        /** "due 6:00 PM today" / "due Monday". */
        fun dueLabel(ctx: Context, r: ReminderStore.Reminder): String =
            if (r.dueHasTime) "due ${time(ctx, r.dueAtMs)} ${day(r.dueAtMs)}" else "due ${day(r.dueAtMs)}"

        fun ensureChannel(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Deadlines and plans ConvoAI found in your chats"
                },
            )
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val ctx = context.applicationContext
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
            ACTION_EXACT_ALARM_STATE -> ReminderScheduler.rescheduleAll(ctx) // exact grant → re-arm precisely
            ACTION_FIRE -> intent.getStringExtra(EXTRA_ID)?.let { fire(ctx, it) }
            ACTION_DONE -> intent.getStringExtra(EXTRA_ID)?.let { id ->
                ReminderStore.get(ctx, id)?.let { ReminderStore.update(ctx, it.copy(status = ReminderStore.STATUS_DONE)) }
                ReminderScheduler.cancel(ctx, id)
                cancelNotification(ctx, id)
                IndicContextModule.instance?.emitRemindersChanged()
            }
            ACTION_SNOOZE -> intent.getStringExtra(EXTRA_ID)?.let { id ->
                ReminderStore.get(ctx, id)?.let {
                    val snoozed = it.copy(remindAtMs = System.currentTimeMillis() + SNOOZE_MS, notified = false)
                    ReminderStore.update(ctx, snoozed)
                    ReminderScheduler.schedule(ctx, snoozed)
                }
                cancelNotification(ctx, id)
                IndicContextModule.instance?.emitRemindersChanged()
            }
        }
    }

    private fun cancelNotification(ctx: Context, id: String) {
        ctx.getSystemService(NotificationManager::class.java)?.cancel(notificationId(id))
    }

    private fun fire(ctx: Context, id: String) {
        val r = ReminderStore.get(ctx, id) ?: return
        if (r.status != ReminderStore.STATUS_ACTIVE) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "notification permission missing; reminder '${r.task}' not shown")
            return
        }
        ensureChannel(ctx)

        val open = ctx.packageManager.getLaunchIntentForPackage(r.appPackage)
            ?: ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val contentPi = open?.let {
            PendingIntent.getActivity(ctx, notificationId(id), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        fun action(act: String, code: Int) = PendingIntent.getBroadcast(
            ctx, notificationId(id) + code,
            Intent(ctx, ReminderReceiver::class.java).setAction(act).putExtra(EXTRA_ID, id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val text = "${dueLabel(ctx, r).replaceFirstChar { it.uppercase() }} · ${r.chat}"
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("⏰ ${r.task}")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setColor(0xFFC8143F.toInt())
            .setAutoCancel(true)
            .apply { contentPi?.let { setContentIntent(it) } }
            .addAction(0, "✓ Done", action(ACTION_DONE, 1))
            .addAction(0, "⏱ Snooze 15 min", action(ACTION_SNOOZE, 2))
            .build()
        ctx.getSystemService(NotificationManager::class.java)?.notify(notificationId(id), n)
        ReminderStore.update(ctx, r.copy(notified = true))
        IndicContextModule.instance?.emitRemindersChanged()
    }
}
