package com.indiccontext

import android.content.Context
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

/**
 * Plays a short Timbre v3.0 sample of a voice (used by the voice pickers in the app).
 * Samples are cached per voice + language in cache/voice_previews/, so each one costs
 * a single TTS call ever (per language).
 */
object VoicePreviewPlayer {
    private const val TAG = "VoicePreview"
    private val main = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null

    private fun sampleText(voice: String, language: String): Pair<String, String> = when (language) {
        "hi-IN" -> "नमस्ते! मैं $voice हूँ। आपके वॉइस नोट्स ऐसे सुनाई देंगे।" to "hi-IN"
        else -> "Hi! I'm $voice. Your voice notes will sound like this." to "en-IN"
    }

    /**
     * Synthesises (or reuses) the sample and starts playback.
     * [onResult] runs on the main thread: null = playing, otherwise an error message.
     */
    fun play(context: Context, voice: String, language: String, onResult: (String?) -> Unit) {
        stop()
        val (text, lang) = sampleText(voice, language)
        val dir = File(context.cacheDir, "voice_previews").apply { mkdirs() }
        val file = File(dir, "${voice}_$lang.ogg")
        if (file.exists() && file.length() > 0) {
            main.post { onResult(startPlayback(file)) }
            return
        }
        GnaniTtsClient.synthesize(text, voice, lang, file) { result ->
            main.post {
                result.onSuccess { onResult(startPlayback(it)) }
                    .onFailure { e ->
                        Log.w(TAG, "sample synthesis failed: ${e.message}")
                        onResult(e.message ?: "Couldn't generate the sample")
                    }
            }
        }
    }

    private fun startPlayback(file: File): String? = try {
        player = MediaPlayer().apply {
            setDataSource(file.absolutePath)
            setOnCompletionListener { stop() }
            prepare()
            start()
        }
        null
    } catch (e: Exception) {
        Log.w(TAG, "playback failed: ${e.message}")
        stop()
        "Couldn't play the sample"
    }

    fun stop() {
        player?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        player = null
    }

    fun isPlaying(): Boolean = try { player?.isPlaying == true } catch (_: Exception) { false }
}
