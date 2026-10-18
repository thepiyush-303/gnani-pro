package com.indiccontext

/**
 * Overlay behaviour modes selectable from the dashboard.
 *
 * INPUT_BAR  — toolbar appears ONLY when a chat input field is focused
 *              (keyboard is open). Hides when keyboard closes, user taps
 *              away, or leaves the supported app.
 *
 * EDGE_SLIDER — a faded semi-transparent pill is permanently docked to the
 *               right edge of the screen whenever a supported app is in the
 *               foreground. Tapping the pill expands the full toolbar; tapping
 *               the X or outside collapses it back to the pill.
 */
enum class OverlayMode {
    INPUT_BAR,
    EDGE_SLIDER;

    companion object {
        /** Parse a string coming from JavaScript. Defaults to INPUT_BAR on unknown values. */
        fun from(value: String?): OverlayMode =
            values().firstOrNull { it.name == value?.uppercase() } ?: INPUT_BAR
    }
}

