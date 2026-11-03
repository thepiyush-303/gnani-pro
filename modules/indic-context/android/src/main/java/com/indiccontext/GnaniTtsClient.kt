package com.indiccontext

import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Client for Gnani Timbre text-to-speech.
 * Docs: https://docs.gnani.ai/api/TTS/tts-inference
 *
 * Endpoint: POST https://api.vachana.ai/api/v1/tts/inference
 * Auth header: X-API-Key-ID (same key as Prisma STT — see [GnaniSttClient.apiKey])
 * Response: raw binary audio in the requested container.
 *
 * Output is Ogg/Opus mono 48 kHz — the same format WhatsApp uses for voice notes.
 * Verified 2026-11-03: timbre-v3.0 / Devansh returned 200 in ~1.7–2 s for hi-IN,
 * en-IN and auto (Roman Hinglish).
 */
object GnaniTtsClient {

    private const val TAG = "GnaniTtsClient"
    private const val ENDPOINT = "https://api.vachana.ai/api/v1/tts/inference"
    const val MODEL = "timbre-v3.0"

    /** Languages Timbre v3.0 accepts explicitly; anything else falls back to script detection. */
    private val TTS_LANGUAGES = setOf(
        "hi-IN", "en-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "bn-IN", "gu-IN",
    )

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    /**
     * Synthesises [text] in [voice] and writes the audio to [outFile].
     * [callback] runs on the OkHttp dispatcher thread.
     */
    fun synthesize(
        text: String,
        voice: String,
        languageCode: String,
        outFile: File,
        callback: (Result<File>) -> Unit,
    ) {
        val key = GnaniSttClient.apiKey.trim()
        if (key.isEmpty()) {
            callback(Result.failure(IllegalStateException("Gnani API key is missing.")))
            return
        }
        val language = if (languageCode in TTS_LANGUAGES) languageCode else "auto"
        val body = JSONObject().apply {
            put("text", text)
            put("model", MODEL)
            put("voice", voice)
            put("language", language)
            put("audio_config", JSONObject().apply {
                put("sample_rate", 48000)
                put("encoding", "oggopus")
                put("container", "ogg")
            })
        }
        val request = Request.Builder()
            .url(ENDPOINT)
            .addHeader("X-API-Key-ID", key)
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        Log.i(TAG, "TTS request: voice=$voice lang=$language chars=${text.length}")
        val startedAt = System.currentTimeMillis()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "TTS network error: ${e.message}", e)
                callback(Result.failure(e))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { res ->
                    try {
                        if (!res.isSuccessful) {
                            val err = res.body?.string().orEmpty().take(200)
                            Log.e(TAG, "TTS HTTP ${res.code}: $err")
                            callback(Result.failure(IOException("Gnani TTS HTTP ${res.code}: $err")))
                            return
                        }
                        val stream = res.body?.byteStream()
                            ?: throw IOException("Gnani TTS returned an empty body")
                        outFile.parentFile?.mkdirs()
                        outFile.outputStream().use { out -> stream.copyTo(out) }
                        if (outFile.length() == 0L) throw IOException("Gnani TTS returned no audio")
                        Log.i(TAG, "TTS ok: ${outFile.length()} B in ${System.currentTimeMillis() - startedAt} ms")
                        callback(Result.success(outFile))
                    } catch (e: Exception) {
                        Log.e(TAG, "TTS failed: ${e.message}", e)
                        outFile.delete()
                        callback(Result.failure(e))
                    }
                }
            }
        })
    }
}
