package com.indiccontextkeyboard

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent

class ChatAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        // TODO: Initialize context extraction pipeline and RN bridge callbacks.
        Log.d(TAG, "ChatAccessibilityService connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // TODO: Capture relevant screen context for LLM prompt enrichment.
        Log.v(TAG, "Accessibility event received: ${event?.eventType}")
    }

    override fun onInterrupt() {
        // TODO: Handle interruption/recovery behavior for context collection.
        Log.w(TAG, "ChatAccessibilityService interrupted")
    }

    companion object {
        private const val TAG = "ChatAccessibilityService"
    }
}
