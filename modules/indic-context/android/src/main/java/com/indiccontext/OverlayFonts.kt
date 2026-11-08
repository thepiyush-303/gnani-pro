package com.indiccontext

import android.content.Context
import android.graphics.Typeface
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat

/**
 * JetBrains Mono for every overlay surface (DESIGN.md typography: mono, default weight 500).
 * Applied in code through ResourcesCompat so it also works below Android 8 (minSdk 23),
 * where `android:fontFamily="@font/…"` in XML would be ignored.
 */
object OverlayFonts {
    @Volatile private var medium: Typeface? = null
    @Volatile private var semibold: Typeface? = null

    fun medium(ctx: Context): Typeface? =
        medium ?: load(ctx, R.font.jetbrains_mono_medium).also { medium = it }

    fun semibold(ctx: Context): Typeface? =
        semibold ?: load(ctx, R.font.jetbrains_mono_semibold).also { semibold = it }

    private fun load(ctx: Context, id: Int): Typeface? =
        try { ResourcesCompat.getFont(ctx, id) } catch (e: Exception) { null }

    /** Sets JetBrains Mono on every TextView under [root]; bold-styled text gets SemiBold (600). */
    fun apply(root: View) {
        val ctx = root.context
        if (root is TextView) {
            val bold = root.typeface?.isBold == true
            (if (bold) semibold(ctx) else medium(ctx))?.let { root.typeface = it }
        }
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) apply(root.getChildAt(i))
        }
    }
}
