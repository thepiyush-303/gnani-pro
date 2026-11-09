# ⏰ Deadline Reminders

ConvoAI spots things **you** owe in the chats you open and reminds you before they're due.

| In the chat | What ConvoAI does |
|---|---|
| Boss: "Update me by 6:00 PM" | Reminder at **5:30 PM** (30 min before by default) |
| You: "I'll provide the review by Monday" | Reminder **Monday 9:00 AM** (a day without a time → 9 AM) |
| "Let's meet at 5" → "done" | Reminder at **4:30 PM** (an event you take part in) |
| Contact: "kal tak bhej dunga" | **Nothing.** They owe you; 💬 Smart Replies' follow-up covers that |
| "update me by 6" … later "sent!" | **Nothing.** It's already done |

## Decisions

- **Automatic, filtered.** An on-phone regex (`deadlineCues.ts`) checks each new message for a time, day, date or deadline word (English, Hinglish, Devanagari). Only messages that match go to the AI, in **one call per batch**. Ordinary chat makes no AI calls. This is the one exception to "AI only on button taps", and it's switched off on Home under **Reminders → Detect deadlines in chats**.
- **Each message is analysed at most once.** Its key (`chat|sender|sentDate|sentTime|text`) is *claimed* natively before the call (an LRU of 500 keys). If the call fails on a network, timeout or HTTP error, the keys are released so the next visit retries; a parse failure doesn't retry.
- **Only recent messages.** A message must have a known `sentDate` within the last 2 days, so scrolling through old history doesn't create reminders.
- **Kept:** `owed_by` user or both, and `confidence: high`. Low-confidence items are dropped.
- **Saved straight away.** If a chat is open, a "⏰ Reminder set" card shows with **↩ Undo**, and for timed deadlines **Remind 1 hr before** / **10 min before**.
- **Remind time** (`ReminderTimes.kt`, unit-tested):
  - timed: due − lead. If that moment has passed but the deadline hasn't, the reminder fires in about a minute. If the deadline has passed, nothing is set.
  - date-only: 9:00 AM that day. If that has passed on the day itself, 6:00 PM. If that has passed too, nothing is set.
- **Notification:** "⏰ {task}" / "Due 6:00 PM · {chat}", with **✓ Done** and **Snooze 15 min** actions. Tapping it opens WhatsApp.

## Limits (be honest in demos)

- ConvoAI only sees chats you **open** (the accessibility service reads the screen). A message in a chat you never open isn't detected. Reading WhatsApp notifications would need another sensitive permission, so it's out of scope.
- **Exact times** need Android's "Alarms & reminders" access. It's off by default for new installs on Android 14. Without it, alarms use `setAndAllowWhileIdle` and can arrive a few minutes late in Doze. Home shows an **Allow** hint, and the app re-arms all reminders when access is granted (`SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`).
- **Notifications permission** (Android 13+) is optional for the rest of the app but required for reminders to be seen. It's step 7 of the tutorial and the 4th row of Home's setup checklist.

## Privacy

Until this feature, nothing was written to disk. Now ConvoAI stores **only the reminders** (short task text, chat name, times) and the claimed message keys, in the SharedPreferences file `convoai_reminders`. **Chat messages are still never stored.** Completed reminders are pruned after 7 days. The accessibility description, tutorial and guide say so.

## Files

| Layer | File | Job |
|---|---|---|
| JS | `src/services/reminders/deadlineCues.ts` | `hasDeadlineCue(text)`: the on-phone filter |
| JS | `src/services/reminders/commitments.ts` | `extractCommitments()` (the LLM call), `parseDue()`, `messageKey()`, with no native imports (used by the eval) |
| JS | `src/services/reminders/commitmentDetector.ts` | `onBuffer()`: debounce 3 s → filter → claim → extract → `addReminder` |
| JS | `src/services/llm/prompts.ts` | `COMMITMENTS_SYSTEM_PROMPT` |
| JS | `src/hooks/CopilotBridge.tsx` | Calls `onBuffer` on every buffer update |
| JS | `src/ui/RemindersSection.tsx` | Home: switch, lead time (10/15/30/60), upcoming list with ✓ / 🗑, hints |
| Native | `ReminderStore.kt` | Reminders + claimed keys + settings (`autoDetect`, `leadMinutes`) |
| Native | `ReminderTimes.kt` | The remind-time rules (`ReminderTimesTest.kt`) |
| Native | `ReminderScheduler.kt` | AlarmManager: exact if allowed, otherwise inexact |
| Native | `ReminderReceiver.kt` | Fires the notification, handles Done / Snooze, and re-arms on boot, update or exact-alarm grant |
| Native | `OverlayService.showReminderCard` | The "⏰ Reminder set" card with Undo / re-time chips |

Bridge functions (`modules/indic-context/src/index.ts`):
- reminder data: `claimMessages`, `unclaimMessages`, `addReminder`, `listReminders`, `completeReminder`, `deleteReminder`;
- settings: `getReminderSettings`, `setReminderSettings`, `openExactAlarmSettings`;
- events: `addRemindersChangedListener`.

## Testing

- `npm run eval:prompts` covers:
  - cue tables and `parseDue`, offline;
  - 6 live extraction fixtures: boss 6 PM, review by Monday, meet at 5, contact promise ignored, done later ignored, past deadline ignored.
- Native tests run with `cd android && ./gradlew :indic-context:testDebugUnitTest`, which includes `ReminderTimesTest`.
- **On device:**
  1. From a second phone, send "Update me by <now + 40 min>" and open the chat. The "⏰ Reminder set" card appears, and **Undo** removes it from Home.
  2. Leave it set. A notification arrives 30 min before; check that ✓ Done and Snooze work.
  3. Reboot. The reminder is still listed and still fires.
  4. Change "Remind me before" on Home. Upcoming timed reminders are re-timed.
  5. Turn off "Detect deadlines". `adb logcat | grep Reminders` stays silent when new messages arrive.
