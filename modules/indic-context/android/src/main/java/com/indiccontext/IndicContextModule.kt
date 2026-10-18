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
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * IndicContextModule — Phase 1 Scaffold
 *
 * The React Native ↔ Kotlin bridge.
 * Exposed as the native module named "IndicContext" to TypeScript via
 * expo-modules-core. All @AsyncFunction calls run on Expo's background thread.
 *
 * ## Registered Functions (Phase 1)
 * - checkPermissions()    → PermissionStatusRecord
 * - requestMicrophonePermission()
 * - startOverlay()
 * - stopOverlay()
 * - getSessionBuffer()    → List<Map>
 * - injectText(text)
 * - readInputFieldText()  → String
 *
 * ## Events Emitted (wired up in Phase 2)
 * - onBufferUpdated
 * - onInputFieldFocused
 * - onInputFieldBlurred
 */
class IndicContextModule : Module() {

    private val ctx: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext is null" }

    override fun definition() = ModuleDefinition {

        Name("IndicContext")

        // Declare the events this module can emit to JavaScript
        Events("onBufferUpdated", "onInputFieldFocused", "onInputFieldBlurred")

        // ───────────────────────────────────────────────────────────────
        // Permissions
        // ───────────────────────────────────────────────────────────────

        AsyncFunction("checkPermissions") {
            val overlayGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(ctx)
            } else true

            val accessibilityGranted = ChatAccessibilityService.instance != null

            val micGranted = ContextCompat.checkSelfPermission(
                ctx, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            mapOf(
                "overlay" to if (overlayGranted) "granted" else "denied",
                "accessibility" to if (accessibilityGranted) "granted" else "denied",
                "microphone" to if (micGranted) "granted" else "denied",
            )
        }

        AsyncFunction("requestMicrophonePermission") { promise: Promise ->
            // expo-modules-core handles runtime permission requests via appContext.
            // For a full implementation, we use the permissions API.
            // Phase 1 stub: the dashboard screen uses Linking to open settings as fallback.
            promise.resolve(null)
        }

        // ───────────────────────────────────────────────────────────────
        // Overlay control
        // ───────────────────────────────────────────────────────────────

        AsyncFunction("startOverlay") {
            val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(ctx)
            } else true

            if (!canDraw) {
                throw Exception("SYSTEM_ALERT_WINDOW permission not granted. Cannot start overlay.")
            }

            val intent = Intent(ctx, OverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
            null
        }

        AsyncFunction("stopOverlay") {
            val intent = Intent(ctx, OverlayService::class.java)
            ctx.stopService(intent)
            null
        }

        // ───────────────────────────────────────────────────────────────
        // Session buffer
        // ───────────────────────────────────────────────────────────────

        AsyncFunction("getSessionBuffer") {
            val service = ChatAccessibilityService.instance
                ?: return@AsyncFunction emptyList<Map<String, Any?>>()

            service.getBuffer().map { bubble ->
                mapOf(
                    "text" to bubble.text,
                    "isSelf" to bubble.isSelf,
                    "capturedAtMs" to bubble.capturedAtMs,
                    "nodeClassName" to bubble.nodeClassName,
                    "appPackage" to bubble.appPackage,
                )
            }
        }

        // ───────────────────────────────────────────────────────────────
        // Text injection
        // ───────────────────────────────────────────────────────────────

        AsyncFunction("injectText") { text: String ->
            val service = ChatAccessibilityService.instance
                ?: throw Exception("AccessibilityService not connected. Enable it in Accessibility Settings.")
            val ok = service.injectText(text)
            if (!ok) throw Exception("Text injection failed: no focused input field detected.")
        }

        AsyncFunction("readInputFieldText") {
            ChatAccessibilityService.instance?.readInputFieldText() ?: ""
        }
    }
}
