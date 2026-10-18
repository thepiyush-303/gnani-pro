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

    companion object {
        @Volatile
        var instance: IndicContextModule? = null
            private set
    }

    override fun definition() = ModuleDefinition {

        Name("IndicContext")

        OnCreate { IndicContextModule.instance = this@IndicContextModule }
        OnDestroy { IndicContextModule.instance = null }

        Events(
            "onBufferUpdated",
            "onInputFieldFocused",
            "onInputFieldBlurred",
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

        // ── Overlay control ───────────────────────────────────────

        AsyncFunction("startOverlay") {
            val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(ctx) else true
            if (!canDraw) throw Exception("SYSTEM_ALERT_WINDOW permission not granted.")

            val intent = Intent(ctx, OverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ctx.startForegroundService(intent)
            else
                ctx.startService(intent)
            Unit
        }

        AsyncFunction("stopOverlay") {
            ctx.stopService(Intent(ctx, OverlayService::class.java))
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
    }

    // ───────────────────────────────────────────────────────────────
    // Emit helpers — called by ChatAccessibilityService on main thread
    // ───────────────────────────────────────────────────────────────

    fun emitBufferUpdated(snapshot: List<ChatBubble>) {
        try {
            sendEvent(
                "onBufferUpdated",
                mapOf(
                    "buffer" to snapshot.map { b ->
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
}
