package com.indiccontext

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaActionSound
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Voice Changer — speak, and send the same words in a Gnani Timbre v3.0 voice.
 *
 * 🗣️ toolbar button:
 *   • hold + glide → pick one of 6 voices (GlideMenu, like the 🎙️ language picker)
 *   • tap          → start recording at once (start chime, live timer on the button)
 *   • tap again    → stop (stop chime) → Prisma STT → Timbre TTS, button shows "processing"
 *   → "✅ Ready in X's voice" card: 📤 Send · ▶ Play · 🔄 Other voice
 *
 * 📤 Send with a WhatsApp chat open shares the Ogg/Opus note and lets
 * [WhatsAppAutoSender] pick that chat and tap send. With no chat open it falls
 * back to the plain share sheet.
 *
 * This re-voices the WORDS (speech → text → speech). Tone and pauses are not carried over.
 */
class VoiceChangerController(
    private val context: Context,
    private val ui: Ui,
) {
    sealed class ButtonState {
        data class Idle(val voiceBadge: String) : ButtonState()
        data class Recording(val elapsedMs: Long) : ButtonState()
        object Processing : ButtonState()
    }

    /** What the controller needs from the overlay. */
    interface Ui {
        /** Shows the floating card; each action is a tappable chip. */
        fun showCard(title: String, subtitle: String?, actions: List<Pair<String, () -> Unit>>)
        fun hideCard()
        fun setButtonState(state: ButtonState)
        /** Active STT language: code (e.g. "hi-IN") and badge (e.g. "HI"). */
        fun currentLanguage(): Pair<String, String>
        /** True while the dictation mic is recording (only one recorder at a time). */
        fun isDictationRecording(): Boolean
    }

    data class Voice(val id: String, val male: Boolean, val style: String) {
        val badge: String get() = id.take(3).uppercase()
        val label: String get() = "$id ${if (male) "♂" else "♀"}"
    }

    private enum class State { IDLE, STARTING, RECORDING, PROCESSING }

    companion object {
        private const val TAG = "VoiceChanger"
        private const val PREFS = "indic_context_prefs"
        private const val PREF_VOICE = "tts_voice"
        private const val SHARE_DIR = "voice_notes"
        private const val KEEP_FILES_MS = 60 * 60 * 1000L
        private const val MIN_AUDIO_BYTES = 1000L
        private const val MIN_RECORD_MS = 700L
        /** Let the start chime finish so it isn't recorded. */
        private const val START_CHIME_MS = 320L

        /** 3 male + 3 female Timbre v3.0 voices; each speaks all 10 supported languages. */
        val VOICES = listOf(
            Voice("Devansh", male = true, style = "upbeat"),
            Voice("Yashraj", male = true, style = "warm"),
            Voice("Avinash", male = true, style = "calm, firm"),
            Voice("Lakshmi", male = false, style = "lively"),
            Voice("Shivani", male = false, style = "warm"),
            Voice("Riyaa", male = false, style = "confident"),
        )
    }

    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val recorder = VoiceRecorder(context).also { r ->
        r.onTimeoutListener = { main.post { stopAndProcess() } }
    }
    private val chime = MediaActionSound().apply {
        load(MediaActionSound.START_VIDEO_RECORDING)
        load(MediaActionSound.STOP_VIDEO_RECORDING)
    }

    private var state = State.IDLE
    private var recordStartedAt = 0L
    private val timerTick = object : Runnable {
        override fun run() {
            if (state != State.RECORDING) return
            ui.setButtonState(ButtonState.Recording(System.currentTimeMillis() - recordStartedAt))
            main.postDelayed(this, 250L)
        }
    }

    /** Voice used for the current note (may differ from the default after "Other voice"). */
    private var noteVoice: Voice = selectedVoice()
    private var language: Pair<String, String> = "en-IN" to "EN"
    private var transcript: String? = null
    private var output: File? = null
    private var player: MediaPlayer? = null

    // ── Voice selection (glide menu) ────────────────────────────────

    fun selectedVoice(): Voice {
        val id = prefs.getString(PREF_VOICE, null)
        return VOICES.firstOrNull { it.id == id } ?: VOICES.first()
    }

    fun glideItems(): List<GlideMenu.Item> = VOICES.map { GlideMenu.Item(it.id, it.label, it.style) }

    fun selectVoice(id: String) {
        val v = VOICES.firstOrNull { it.id == id } ?: return
        prefs.edit().putString(PREF_VOICE, v.id).apply()
        if (state == State.IDLE) ui.setButtonState(ButtonState.Idle(v.badge))
        toast("🗣️ Voice: ${v.id}")
    }

    /** The glide menu is only offered while idle. */
    fun canPickVoice(): Boolean = state == State.IDLE

    fun isRecording(): Boolean = state == State.STARTING || state == State.RECORDING

    fun initialButtonState(): ButtonState = ButtonState.Idle(selectedVoice().badge)

    // ── Tap: record / stop ─────────────────────────────────────────

    fun onButtonTap() {
        when (state) {
            State.IDLE -> beginRecording()
            State.STARTING -> abortStart()
            State.RECORDING -> stopAndProcess()
            State.PROCESSING -> toast("Working on your voice note…")
        }
    }

    fun release() {
        main.removeCallbacks(timerTick)
        stopPreview()
        if (recorder.isRecording()) recorder.cancel()
        state = State.IDLE
        try { chime.release() } catch (_: Exception) {}
    }

    private fun beginRecording() {
        if (ui.isDictationRecording()) {
            toast("Stop the 🎙️ dictation first.")
            return
        }
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            toast("Microphone permission not granted. Allow it in the app settings.")
            return
        }
        stopPreview()
        ui.hideCard()
        noteVoice = selectedVoice()
        language = ui.currentLanguage()
        transcript = null
        output = null

        state = State.STARTING
        playChime(MediaActionSound.START_VIDEO_RECORDING)
        ui.setButtonState(ButtonState.Recording(0))
        main.postDelayed({
            if (state != State.STARTING) return@postDelayed
            try {
                recorder.start()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start recorder: ${e.message}", e)
                state = State.IDLE
                ui.setButtonState(ButtonState.Idle(selectedVoice().badge))
                toast("Couldn't start the microphone: ${e.message}")
                return@postDelayed
            }
            state = State.RECORDING
            recordStartedAt = System.currentTimeMillis()
            main.post(timerTick)
        }, START_CHIME_MS)
    }

    private fun abortStart() {
        state = State.IDLE
        ui.setButtonState(ButtonState.Idle(selectedVoice().badge))
    }

    private fun stopAndProcess() {
        if (state != State.RECORDING) return
        main.removeCallbacks(timerTick)
        val elapsed = System.currentTimeMillis() - recordStartedAt
        val file = recorder.stop()
        playChime(MediaActionSound.STOP_VIDEO_RECORDING)

        if (file == null || file.length() < MIN_AUDIO_BYTES || elapsed < MIN_RECORD_MS) {
            file?.delete()
            state = State.IDLE
            ui.setButtonState(ButtonState.Idle(selectedVoice().badge))
            toast("Too short. Tap 🗣️ and speak a little longer.")
            return
        }

        state = State.PROCESSING
        ui.setButtonState(ButtonState.Processing)
        GnaniSttClient.transcribe(file, language.first) { result ->
            main.post {
                result.onSuccess { text ->
                    if (text.isBlank()) {
                        finishWithError("No speech recognised. Try again a little closer to the mic.")
                    } else {
                        transcript = text.trim()
                        synthesize(noteVoice)
                    }
                }.onFailure { e ->
                    Log.e(TAG, "STT failed: ${e.message}", e)
                    finishWithError("Couldn't transcribe: ${e.message?.take(80)}")
                }
            }
        }
    }

    private fun synthesize(v: Voice) {
        val text = transcript ?: return
        noteVoice = v
        state = State.PROCESSING
        ui.setButtonState(ButtonState.Processing)
        ui.hideCard()
        GnaniTtsClient.synthesize(text, v.id, language.first, newOutputFile()) { result ->
            main.post {
                state = State.IDLE
                ui.setButtonState(ButtonState.Idle(selectedVoice().badge))
                result.onSuccess { file ->
                    output = file
                    showReady()
                }.onFailure { e ->
                    Log.e(TAG, "TTS failed: ${e.message}", e)
                    ui.showCard("⚠️ Voice generation failed", e.message?.take(120),
                        listOf("↻ Retry" to { synthesize(v) }))
                }
            }
        }
    }

    private fun finishWithError(msg: String) {
        state = State.IDLE
        ui.setButtonState(ButtonState.Idle(selectedVoice().badge))
        toast(msg)
    }

    // ── Ready card ─────────────────────────────────────────────────

    private fun showReady() {
        val open = ChatAccessibilityService.instance?.openConversation()
        val sendLabel = open?.let { "📤 Send to ${shortName(it.first)}" } ?: "📤 Send…"
        ui.showCard(
            "✅ Ready in ${noteVoice.id}'s voice",
            "“$transcript”",
            listOf(
                sendLabel to { share() },
                "▶ Play" to { preview() },
                "🔄 Other voice" to { showOtherVoices() },
            ),
        )
    }

    /** Same words, any of the other 5 voices — no re-recording. */
    private fun showOtherVoices() {
        stopPreview()
        ui.showCard(
            "🔄 Same words, another voice",
            "“$transcript”",
            VOICES.filter { it != noteVoice }.map { v -> "${v.label}  ·  ${v.style}" to { synthesize(v) } },
        )
    }

    private fun preview() {
        val file = output ?: return
        stopPreview()
        try {
            player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                setOnCompletionListener { stopPreview() }
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Preview failed: ${e.message}", e)
            toast("Couldn't play the preview.")
            stopPreview()
        }
    }

    private fun stopPreview() {
        player?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        player = null
    }

    /**
     * Shares the Ogg/Opus note. If a WhatsApp chat is open, [WhatsAppAutoSender]
     * selects exactly that chat in the picker and taps send; otherwise (or if it
     * can't verify the chat) the user finishes in WhatsApp.
     */
    private fun share() {
        val file = output ?: return
        stopPreview()
        val uri = try {
            FileProvider.getUriForFile(context, "${context.packageName}.indiccontext.fileprovider", file)
        } catch (e: Exception) {
            Log.e(TAG, "FileProvider failed: ${e.message}", e)
            toast("Couldn't prepare the voice note for sharing.")
            return
        }
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "audio/ogg"
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri("Voice note", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val svc = ChatAccessibilityService.instance
        val open = svc?.openConversation()
        val chatPkg = open?.second ?: svc?.currentChatPackage ?: "com.whatsapp"
        ui.hideCard()

        if (open != null) {
            svc.startAutoSend(open.first, open.second) { ok, msg ->
                toast(if (ok) "✅ $msg" else msg)
            }
        }
        try {
            context.startActivity(Intent(send).setPackage(chatPkg))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "$chatPkg can't receive the share, using the chooser")
            context.startActivity(
                Intent.createChooser(send, "Send voice note").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun playChime(sound: Int) {
        try { chime.play(sound) } catch (e: Exception) { Log.w(TAG, "chime failed: ${e.message}") }
    }

    private fun shortName(title: String): String = title.split(" ").firstOrNull()?.take(14) ?: title

    private fun newOutputFile(): File {
        val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
        val cutoff = System.currentTimeMillis() - KEEP_FILES_MS
        dir.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
        return File(dir, "voice_note_${System.currentTimeMillis()}.ogg")
    }

    private fun toast(msg: String) {
        main.post { Toast.makeText(context, msg, Toast.LENGTH_SHORT).show() }
    }
}
