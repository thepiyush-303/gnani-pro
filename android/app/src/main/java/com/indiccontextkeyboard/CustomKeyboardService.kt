package com.indiccontextkeyboard

import android.inputmethodservice.InputMethodService
import android.util.Log
import android.view.View

class CustomKeyboardService : InputMethodService() {

    override fun onCreate() {
        super.onCreate()
        // TODO: Bridge IME lifecycle and keyboard events to React Native TypeScript layer.
        Log.d(TAG, "CustomKeyboardService created")
    }

    override fun onCreateInputView(): View? {
        // TODO: Inflate custom keyboard layout and connect to RN-driven suggestions.
        return null
    }

    companion object {
        private const val TAG = "CustomKeyboardService"
    }
}
