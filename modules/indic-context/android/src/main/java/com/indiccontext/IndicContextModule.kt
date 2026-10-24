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
        )

        // ── Permissions ───────────────────────────────────────────

        AsyncFunction("checkPermissions") {
            val overlayOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(ctx) else true
            val a11yOk = ChatAccessibilityService.instance != null
            val micOk = ContextCompat.checkSelfPermission(
                ctx, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            mapOf(
                "overlay"       to if (overlayOk) "granted" else "denied",
                "accessibility" to if (a11yOk)    "granted" else "denied",
                "microphone"    to if (micOk)     "granted" else "denied",
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
                GnaniSttClient.currentLanguage = lang
                ctx.getSharedPreferences("indic_context_prefs", Context.MODE_PRIVATE)
                    .edit().putString("gnani_language", lang).apply()
            }
            GnaniSttClient.currentLanguage
        }

        AsyncFunction("getLanguage") {
            GnaniSttClient.currentLanguage
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

    fun emitCopilotDisabled() {
        try {
            sendEvent("onCopilotDisabled", emptyMap<String, Any>())
        } catch (e: Exception) {
            android.util.Log.w("IndicContextModule", "emitCopilotDisabled: ${e.message}")
        }
    }
}
