package com.indiccontext

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * IndicContextModule — Phase 2
 *
 * Phase 2 additions:
 * - Module instance kept in companion so [ChatAccessibilityService] can call
 *   emit* without a service binding.
 * - [emitBufferUpdated] → fires "onBufferUpdated" to JS with full buffer snapshot.
 * - [emitInputFocused]  → fires "onInputFieldFocused" to JS.
 * - [emitInputBlurred]  → fires "onInputFieldBlurred" to JS.
 * - [injectText]        → real ACTION_SET_TEXT + clipboard fallback.
 */
class IndicContextModule : Module() {

    private val ctx: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext null" }

    private var localVoiceRecorder: VoiceRecorder? = null

    companion object {
        @Volatile
        var instance: IndicContextModule? = null
            private set
    }

    override fun definition() = ModuleDefinition {

        Name("IndicContext")

        OnCreate {
            IndicContextModule.instance = this@IndicContextModule
            // Load saved Gnani configuration if available
            try {
                val prefs = ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                prefs.getString("gnani_api_key", null)?.let {
                    if (it.isNotBlank()) GnaniSttClient.apiKey = it
                }
                prefs.getString("gnani_language", null)?.let {
                    if (it.isNotBlank()) GnaniSttClient.currentLanguage = it
                }
            } catch (e: Exception) {
                android.util.Log.w("IndicContextModule", "Failed to load saved config: ${e.message}")
            }
        }

        OnDestroy {
            localVoiceRecorder?.cancel()
            localVoiceRecorder = null
            IndicContextModule.instance = null
        }

        Events(
            "onBufferUpdated",
            "onInputFieldFocused",
            "onInputFieldBlurred",
            "onVoiceTranscript",
            "onRecordingStateChanged",
            "onCopilotDisabled",
            "onActionTriggered",
            "onRemindersChanged",
        )

        // ── Permissions ───────────────────────────────────────────

        AsyncFunction("checkPermissions") {
            val overlayOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(ctx) else true
            val a11yOk = ChatAccessibilityService.instance != null
            val micOk = ContextCompat.checkSelfPermission(
                ctx, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            // Covers the Android 13+ runtime permission and notifications blocked in app settings
            val notifOk = androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled()

            mapOf(
                "overlay"       to if (overlayOk) "granted" else "denied",
                "accessibility" to if (a11yOk)    "granted" else "denied",
                "microphone"    to if (micOk)     "granted" else "denied",
                "notifications" to if (notifOk)   "granted" else "denied",
            )
        }

        AsyncFunction("requestMicrophonePermission") { promise: Promise ->
            // Runtime permission requires Activity context; dashboard falls back to Linking.openSettings
            promise.resolve(null)
        }

        // ── Gnani STT Configuration (Phase 3) ─────────────────────

        AsyncFunction("setGnaniConfig") { apiKey: String?, language: String? ->
            val prefs = ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
            val editor = prefs.edit()
            if (!apiKey.isNullOrBlank()) {
                GnaniSttClient.apiKey = apiKey
                editor.putString("gnani_api_key", apiKey)
            }
            if (!language.isNullOrBlank()) {
                GnaniSttClient.currentLanguage = language
                editor.putString("gnani_language", language)
            }
            editor.apply()
            mapOf("apiKeySet" to !apiKey.isNullOrBlank(), "language" to GnaniSttClient.currentLanguage)
        }

        AsyncFunction("getGnaniConfig") {
            mapOf(
                "apiKeyConfigured" to GnaniSttClient.apiKey.isNotBlank(),
                "language" to GnaniSttClient.currentLanguage
            )
        }

        AsyncFunction("setLanguage") { lang: String ->
            if (lang.isNotBlank()) {
                // Running overlay: also refreshes the 🎙 badge. Otherwise just persist.
                val applied = OverlayService.instance?.applyLanguage(lang) ?: false
                if (!applied) {
                    GnaniSttClient.currentLanguage = lang
                    ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                        .edit().putString("gnani_language", lang).apply()
                }
            }
            GnaniSttClient.currentLanguage
        }

        AsyncFunction("getLanguage") {
            ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                .getString("gnani_language", null) ?: GnaniSttClient.currentLanguage
        }

        // ── Voice Changer voices (Timbre v3.0) ────────────────────

        AsyncFunction("getVoices") {
            VoiceChangerController.VOICES.map { v ->
                mapOf("id" to v.id, "gender" to (if (v.male) "male" else "female"), "style" to v.style)
            }
        }

        AsyncFunction("getVoice") {
            val id = ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE).getString("tts_voice", null)
            (VoiceChangerController.VOICES.firstOrNull { it.id == id } ?: VoiceChangerController.VOICES.first()).id
        }

        /** Plays a short sample of a Timbre voice in the current speech language (cached after the first call). */
        AsyncFunction("previewVoice") { id: String, promise: Promise ->
            val v = VoiceChangerController.VOICES.firstOrNull { it.id == id }
            if (v == null) {
                promise.reject("ERR_VOICE", "Unknown voice: $id", null)
                return@AsyncFunction
            }
            val lang = ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                .getString("gnani_language", "en-IN") ?: "en-IN"
            VoicePreviewPlayer.play(ctx, v.id, lang) { error ->
                if (error == null) promise.resolve(v.id) else promise.reject("ERR_PREVIEW", error, null)
            }
        }

        AsyncFunction("stopVoicePreview") {
            VoicePreviewPlayer.stop()
            Unit
        }

        AsyncFunction("setVoice") { id: String ->
            val v = VoiceChangerController.VOICES.firstOrNull { it.id == id }
                ?: throw Exception("Unknown voice: $id")
            ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                .edit().putString("tts_voice", v.id).apply()
            OverlayService.instance?.refreshVoiceBadge()
            v.id
        }

        // ── Voice Recording & STT Control (Phase 3) ───────────────

        AsyncFunction("startVoiceRecording") {
            val micOk = ContextCompat.checkSelfPermission(
                ctx, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            if (!micOk) throw Exception("RECORD_AUDIO permission not granted.")

            val overlaySvc = OverlayService.instance
            if (overlaySvc != null && !overlaySvc.isVoiceRecording()) {
                overlaySvc.toggleVoiceRecording()
            } else {
                if (localVoiceRecorder == null) {
                    localVoiceRecorder = VoiceRecorder(ctx)
                }
                localVoiceRecorder?.start()
                emitRecordingStateChanged(true)
            }
            Unit
        }

        AsyncFunction("stopVoiceRecording") { promise: Promise ->
            val overlaySvc = OverlayService.instance
            if (overlaySvc != null && overlaySvc.isVoiceRecording()) {
                // If overlay service is active, toggle it and wait for transcript event
                overlaySvc.toggleVoiceRecording()
                promise.resolve("Transcribing via overlay...")
                return@AsyncFunction
            }

            val recorder = localVoiceRecorder
            if (recorder == null || !recorder.isRecording()) {
                emitRecordingStateChanged(false)
                promise.resolve("")
                return@AsyncFunction
            }

            val audioFile = recorder.stop()
            emitRecordingStateChanged(false)

            if (audioFile == null || audioFile.length() < 1000L) {
                promise.reject("AUDIO_TOO_SHORT", "Audio recording was too short.", null)
                return@AsyncFunction
            }

            GnaniSttClient.transcribe(audioFile) { result ->
                result.onSuccess { transcript ->
                    emitVoiceTranscript(transcript, true)
                    promise.resolve(transcript)
                }.onFailure { err ->
                    emitVoiceTranscript("", false)
                    promise.reject("STT_ERROR", err.message ?: "Transcription failed", err)
                }
            }
        }

        AsyncFunction("isVoiceRecording") {
            OverlayService.instance?.isVoiceRecording()
                ?: (localVoiceRecorder?.isRecording() == true)
        }

        // ── Overlay control ───────────────────────────────────────

        AsyncFunction("startOverlay") { mode: String ->
            val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(ctx) else true
            if (!canDraw) throw Exception("SYSTEM_ALERT_WINDOW permission not granted.")

            OverlayService.isCopilotActive = true

            val intent = Intent(ctx, OverlayService::class.java).apply {
                putExtra("mode", mode)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ctx.startForegroundService(intent)
            else
                ctx.startService(intent)
            Unit
        }

        // ── 🌐 Translate ───────────────────────────────────────────

        AsyncFunction("getTranslateTarget") {
            ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                .getString("translate_target", "en-IN") ?: "en-IN"
        }

        /** Clears/sets a toolbar button's busy state (currently only "translate"). */
        AsyncFunction("setToolbarBusy") { action: String, busy: Boolean ->
            if (action == "translate") OverlayService.instance?.setTranslateBusy(busy)
            Unit
        }

        // ── ⏰ Deadline reminders ──────────────────────────────────

        /** Returns the message keys never analysed before and marks them analysed (each message → AI at most once). */
        AsyncFunction("claimMessages") { keys: List<String> ->
            ReminderStore.claim(ctx, keys)
        }

        AsyncFunction("unclaimMessages") { keys: List<String> ->
            ReminderStore.unclaim(ctx, keys)
        }

        /** Saves + schedules a reminder; shows the "⏰ Reminder set" card if a chat is open. Null if too late to remind. */
        AsyncFunction("addReminder") { task: String, chat: String, appPackage: String, dueAtMs: Double, dueHasTime: Boolean, sourceKey: String ->
            val r = ReminderStore.add(ctx, task, chat, appPackage, dueAtMs.toLong(), dueHasTime, sourceKey)
                ?: return@AsyncFunction null
            ReminderScheduler.schedule(ctx, r)
            OverlayService.instance?.showReminderCard(r)
            emitRemindersChanged()
            r.toMap()
        }

        AsyncFunction("listReminders") {
            ReminderStore.active(ctx).map { it.toMap() }
        }

        AsyncFunction("completeReminder") { id: String ->
            ReminderStore.get(ctx, id)?.let { ReminderStore.update(ctx, it.copy(status = ReminderStore.STATUS_DONE)) }
            ReminderScheduler.cancel(ctx, id)
            emitRemindersChanged()
            Unit
        }

        AsyncFunction("deleteReminder") { id: String ->
            ReminderScheduler.cancel(ctx, id)
            ReminderStore.remove(ctx, id)
            emitRemindersChanged()
            Unit
        }

        /** Android 12+ "Alarms & reminders" screen for this app (exact reminder times). */
        AsyncFunction("openExactAlarmSettings") {
            val intent = if (Build.VERSION.SDK_INT >= 31)
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, android.net.Uri.parse("package:${ctx.packageName}"))
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${ctx.packageName}"))
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }

        AsyncFunction("getReminderSettings") {
            mapOf(
                "autoDetect" to ReminderStore.autoDetect(ctx),
                "leadMinutes" to ReminderStore.leadMinutes(ctx),
                "exactAlarms" to ReminderScheduler.canExact(ctx),
            )
        }

        /** Changing the lead time re-times active, not-yet-fired timed reminders. */
        AsyncFunction("setReminderSettings") { autoDetect: Boolean, leadMinutes: Int ->
            ReminderStore.setSettings(ctx, autoDetect, leadMinutes)
            val now = System.currentTimeMillis()
            ReminderStore.active(ctx).filter { it.dueHasTime && !it.notified }.forEach { r ->
                val at = ReminderTimes.remindAt(r.dueAtMs, true, leadMinutes, now) ?: return@forEach
                val updated = r.copy(remindAtMs = at)
                ReminderStore.update(ctx, updated)
                ReminderScheduler.schedule(ctx, updated)
            }
            emitRemindersChanged()
            Unit
        }

        AsyncFunction("isCopilotActive") {
            OverlayService.isCopilotActive && OverlayService.instance != null
        }

        AsyncFunction("stopOverlay") {
            OverlayService.isCopilotActive = false
            OverlayService.instance?.hideOverlay()
            ctx.stopService(Intent(ctx, OverlayService::class.java))
            Unit
        }

        AsyncFunction("setOverlayMode") { mode: String ->
            OverlayService.instance?.setMode(OverlayMode.from(mode)) ?: run {
                // Service not running yet — just update the static currentMode
                OverlayService.currentMode = OverlayMode.from(mode)
            }
            Unit
        }

        // ── Session buffer ────────────────────────────────────────

        AsyncFunction("getSessionBuffer") {
            (ChatAccessibilityService.instance?.getBuffer() ?: emptyList()).map { b ->
                mapOf(
                    "text"          to b.text,
                    "isSelf"        to b.isSelf,
                    "capturedAtMs"  to b.capturedAtMs,
                    "nodeClassName" to b.nodeClassName,
                    "appPackage"    to b.appPackage,
                    "sentDate"      to b.sentDate,
                    "sentTime"      to b.sentTime,
                )
            }
        }

        // ── Text injection (Phase 2) ──────────────────────────────

        AsyncFunction("injectText") { text: String ->
            val svc = ChatAccessibilityService.instance
                ?: throw Exception("AccessibilityService not connected.")
            val ok = svc.injectText(text)
            if (!ok) throw Exception("Text injection failed — no focused input field.")
            Unit
        }

        AsyncFunction("readInputFieldText") {
            ChatAccessibilityService.instance?.readInputFieldText() ?: ""
        }

        AsyncFunction("getActiveThread") {
            val svc = ChatAccessibilityService.instance
            mapOf(
                "threadTitle" to svc?.activeThreadTitle,
                "threadId" to svc?.activeThreadId,
            )
        }

        // ── Smart Reply & Recommendation Overlay ──────────────────

        AsyncFunction("showSmartReplies") { title: String, subtitle: String?, suggestions: List<String> ->
            OverlayService.instance?.showRecommendations(title, subtitle, suggestions)
            Unit
        }

        AsyncFunction("hideSmartReplies") {
            OverlayService.instance?.hideRecommendations()
            Unit
        }

        AsyncFunction("showAiError") { title: String, message: String, retryAction: String? ->
            OverlayService.instance?.showAiError(title, message, retryAction)
            Unit
        }
    }

    // ───────────────────────────────────────────────────────────────
    // Emit helpers — called by ChatAccessibilityService on main thread
    // ───────────────────────────────────────────────────────────────

    fun emitBufferUpdated(snapshot: List<ChatBubble>, threadTitle: String? = null, threadId: String? = null) {
        try {
            sendEvent(
                "onBufferUpdated",
                mapOf(
                    "threadTitle"   to threadTitle,
                    "threadId"      to threadId,
                    "buffer"        to snapshot.map { b ->
                        mapOf(
                            "text"          to b.text,
                            "isSelf"        to b.isSelf,
                            "capturedAtMs"  to b.capturedAtMs,
                            "nodeClassName" to b.nodeClassName,
                            "appPackage"    to b.appPackage,
                            "sentDate"      to b.sentDate,
                            "sentTime"      to b.sentTime,
                        )
                    }
                )
            )
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitBufferUpdated: ${e.message}")
        }
    }

    fun emitActionTriggered(action: String, draftText: String?) {
        try {
            sendEvent(
                "onActionTriggered",
                mapOf(
                    "action"    to action,
                    "draftText" to (draftText ?: ""),
                )
            )
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitActionTriggered: ${e.message}")
        }
    }

    fun emitInputFocused(appPackage: String, currentText: String) {
        try {
            sendEvent("onInputFieldFocused", mapOf("appPackage" to appPackage, "text" to currentText))
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitInputFocused: ${e.message}")
        }
    }

    fun emitInputBlurred(appPackage: String) {
        try {
            sendEvent("onInputFieldBlurred", mapOf("appPackage" to appPackage, "text" to ""))
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitInputBlurred: ${e.message}")
        }
    }

    fun emitVoiceTranscript(text: String, success: Boolean) {
        try {
            sendEvent(
                "onVoiceTranscript",
                mapOf(
                    "text" to text,
                    "success" to success,
                    "language" to GnaniSttClient.currentLanguage
                )
            )
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitVoiceTranscript: ${e.message}")
        }
    }

    fun emitRecordingStateChanged(isRecording: Boolean) {
        try {
            sendEvent("onRecordingStateChanged", mapOf("isRecording" to isRecording))
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitRecordingStateChanged: ${e.message}")
        }
    }

    fun emitRemindersChanged() {
        try {
            sendEvent("onRemindersChanged", mapOf("at" to System.currentTimeMillis().toDouble()))
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitRemindersChanged: ${e.message}")
        }
    }

    fun emitCopilotDisabled() {
        try {
            sendEvent("onCopilotDisabled", emptyMap<String, Any>())
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitCopilotDisabled: ${e.message}")
        }
    }
}
