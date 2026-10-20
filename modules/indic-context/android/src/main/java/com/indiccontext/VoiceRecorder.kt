package com.indiccontext

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

/**
 * VoiceRecorder — Phase 3
 *
 * Records audio using Android's MediaRecorder into standard MPEG-4 / AAC (.m4a),
 * which is natively accepted by Gnani Prisma v2.5 STT REST API (https://api.vachana.ai/stt/v3).
 *
 * Settings:
 * - Format: MPEG-4
 * - Encoder: AAC
 * - Sample rate: 16kHz
 * - Bitrate: 64kbps
 * - Channels: Mono (1)
 * - Auto-stop timeout: 30 seconds (Gnani ideal limit)
 */
class VoiceRecorder(private val context: Context) {

    private var mediaRecorder: MediaRecorder? = null
    private var currentAudioFile: File? = null
    private var isCurrentlyRecording = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null

    var onTimeoutListener: (() -> Unit)? = null

    companion object {
        private const val TAG = "VoiceRecorder"
        private const val MAX_DURATION_MS = 30_000L // 30 seconds
    }

    @Synchronized
    fun isRecording(): Boolean = isCurrentlyRecording

    @Synchronized
    fun start(): File {
        if (isCurrentlyRecording) {
            Log.w(TAG, "Already recording. Stopping previous session.")
            stop()
        }

        val cacheDir = context.cacheDir
        val audioFile = File(cacheDir, "gnani_stt_${System.currentTimeMillis()}.m4a")
        currentAudioFile = audioFile

        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        try {
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(64_000)
                setAudioSamplingRate(16_000)
                setAudioChannels(1)
                setOutputFile(audioFile.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            isCurrentlyRecording = true
            Log.i(TAG, "Recording started -> ${audioFile.absolutePath}")

            // Set auto-stop timeout at 30 seconds
            val r = Runnable {
                Log.i(TAG, "Recording hit 30s timeout — auto-stopping.")
                onTimeoutListener?.invoke()
            }
            timeoutRunnable = r
            mainHandler.postDelayed(r, MAX_DURATION_MS)

            return audioFile
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MediaRecorder: ${e.message}", e)
            cancel()
            throw e
        }
    }

    @Synchronized
    fun stop(): File? {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null

        val recorder = mediaRecorder ?: return null
        val file = currentAudioFile

        try {
            if (isCurrentlyRecording) {
                recorder.stop()
                Log.i(TAG, "Recording stopped successfully. File size: ${file?.length() ?: 0} bytes")
            }
        } catch (e: Exception) {
            Log.w(TAG, "MediaRecorder.stop() failed (audio too short?): ${e.message}")
        } finally {
            try {
                recorder.reset()
                recorder.release()
            } catch (e: Exception) {
                Log.w(TAG, "MediaRecorder release failed: ${e.message}")
            }
            mediaRecorder = null
            isCurrentlyRecording = false
        }

        return if (file != null && file.exists() && file.length() > 0) file else null
    }

    @Synchronized
    fun cancel() {
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        timeoutRunnable = null

        val recorder = mediaRecorder
        if (recorder != null) {
            try {
                if (isCurrentlyRecording) recorder.stop()
            } catch (e: Exception) { /* ignore */ }
            try {
                recorder.reset()
                recorder.release()
            } catch (e: Exception) { /* ignore */ }
            mediaRecorder = null
            isCurrentlyRecording = false
        }

        currentAudioFile?.let {
            if (it.exists()) it.delete()
        }
        currentAudioFile = null
    }
}

