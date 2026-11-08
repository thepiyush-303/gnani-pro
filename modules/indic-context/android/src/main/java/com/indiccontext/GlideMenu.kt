package com.indiccontext

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Hold-and-glide picker shown in its OWN overlay window, anchored above (or
 * below, if there's no room) a toolbar button.
 *
 * Why a separate window: the old language popup lived inside the toolbar's
 * WRAP_CONTENT window and was positioned with a translation, which doesn't
 * grow the window, so it was clipped and misplaced (worst on the right edge),
 * and the whole toolbar window had to be shifted while it was open.
 *
 * The window is NOT touchable: the touch gesture stays with the button that
 * received ACTION_DOWN, which feeds [hover] with raw screen coordinates.
 */
class GlideMenu(private val context: Context, private val wm: WindowManager) {

    data class Item(val key: String, val label: String, val detail: String? = null)

    private var window: View? = null
    private var rows: List<Pair<Item, TextView>> = emptyList()
    private var hovered: Item? = null
    private var selectedKey: String? = null

    val isShowing: Boolean get() = window != null

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, context.resources.displayMetrics)
    private fun dpi(v: Float) = dp(v).toInt()

    fun show(anchor: View, title: String, items: List<Item>, selectedKey: String?) {
        dismissNow()
        this.selectedKey = selectedKey
        hovered = null

        val menuW = dpi(214f)
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.language_menu_bg)
            setPadding(dpi(8f), dpi(8f), dpi(8f), dpi(6f))
        }
        card.addView(TextView(context).apply {
            text = title
            setTextColor(Color.parseColor("#FDA4AF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            OverlayFonts.semibold(context)?.let { typeface = it } ?: setTypeface(typeface, Typeface.BOLD)
            letterSpacing = 0.05f
            setPadding(dpi(6f), 0, dpi(6f), dpi(6f))
        })
        rows = items.map { item ->
            val row = TextView(context).apply {
                text = buildLabel(item)
                gravity = Gravity.CENTER_VERTICAL
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setPadding(dpi(12f), 0, dpi(12f), 0)
                maxLines = 1
            }
            card.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dpi(34f)).apply {
                bottomMargin = dpi(4f)
            })
            styleRow(item, row, hovered = false)
            item to row
        }

        val caret = ImageView(context).apply { setImageResource(R.drawable.ic_caret_down) }
        val caretW = dpi(14f)
        val container = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

        // Measure to decide placement
        card.measure(
            View.MeasureSpec.makeMeasureSpec(menuW, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val totalH = card.measuredHeight + dpi(8f)

        val loc = IntArray(2)
        anchor.getLocationOnScreen(loc)
        val screenW = context.resources.displayMetrics.widthPixels
        val screenH = context.resources.displayMetrics.heightPixels
        val gap = dpi(6f)
        val topLimit = dpi(28f) // keep clear of the status bar
        val above = loc[1] - gap - totalH >= topLimit
        val anchorCenterX = loc[0] + anchor.width / 2
        val x = (anchorCenterX - menuW / 2).coerceIn(dpi(8f), screenW - menuW - dpi(8f))
        val y = if (above) loc[1] - gap - totalH else (loc[1] + anchor.height + gap).coerceAtMost(screenH - totalH)

        val caretLp = LinearLayout.LayoutParams(caretW, dpi(8f))
        caret.translationX = (anchorCenterX - x - caretW / 2f).coerceIn(dp(12f), menuW - dp(12f) - caretW)
        if (above) {
            container.addView(card, LinearLayout.LayoutParams(menuW, LinearLayout.LayoutParams.WRAP_CONTENT))
            container.addView(caret, caretLp)
        } else {
            caret.rotation = 180f
            container.addView(caret, caretLp)
            container.addView(card, LinearLayout.LayoutParams(menuW, LinearLayout.LayoutParams.WRAP_CONTENT))
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            this.x = x
            this.y = y
        }

        try {
            wm.addView(container, params)
            window = container
            container.alpha = 0f
            container.scaleY = 0.9f
            container.pivotY = if (above) totalH.toFloat() else 0f
            container.animate().alpha(1f).scaleY(1f).setDuration(140).start()
        } catch (e: Exception) {
            android.util.Log.e("GlideMenu", "addView failed: ${e.message}")
            window = null
            rows = emptyList()
        }
    }

    /** Highlights the row under the finger; returns it (or null). */
    fun hover(rawX: Float, rawY: Float): Item? {
        if (window == null) return null
        val loc = IntArray(2)
        var hit: Item? = null
        for ((item, row) in rows) {
            row.getLocationOnScreen(loc)
            val slackX = dp(40f)
            val slackY = dp(2f)
            if (rawX >= loc[0] - slackX && rawX <= loc[0] + row.width + slackX &&
                rawY >= loc[1] - slackY && rawY <= loc[1] + row.height + slackY
            ) {
                hit = item
                break
            }
        }
        if (hit != hovered) {
            hovered = hit
            for ((item, row) in rows) styleRow(item, row, item == hit)
            if (hit != null) window?.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
        }
        return hit
    }

    /** Closes the menu and returns the row the finger was on when released (if any). */
    fun dismiss(): Item? {
        val picked = hovered
        val v = window ?: return picked
        window = null
        rows = emptyList()
        hovered = null
        v.animate().alpha(0f).setDuration(100).withEndAction {
            try { wm.removeView(v) } catch (_: Exception) {}
        }.start()
        return picked
    }

    fun dismissNow() {
        val v = window ?: return
        window = null
        rows = emptyList()
        hovered = null
        try { wm.removeView(v) } catch (_: Exception) {}
    }

    private fun buildLabel(item: Item): String {
        val check = if (item.key == selectedKey) "✓ " else ""
        return if (item.detail.isNullOrBlank()) "$check${item.label}" else "$check${item.label}  ·  ${item.detail}"
    }

    private fun styleRow(item: Item, row: TextView, hovered: Boolean) {
        val selected = item.key == selectedKey
        row.setBackgroundResource(if (hovered) R.drawable.language_pill_selected_bg else R.drawable.language_pill_bg)
        row.setTextColor(Color.parseColor(if (hovered || selected) "#FDA4AF" else "#FFF1F2"))
        val face = if (hovered || selected) OverlayFonts.semibold(context) else OverlayFonts.medium(context)
        if (face != null) row.typeface = face
        else row.setTypeface(null, if (hovered || selected) Typeface.BOLD else Typeface.NORMAL)
        row.animate().scaleX(if (hovered) 1.04f else 1f).scaleY(if (hovered) 1.04f else 1f).setDuration(70).start()
    }
}
