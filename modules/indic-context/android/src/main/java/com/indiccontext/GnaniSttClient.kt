package com.indiccontext

import android.util.Log
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * GnaniSttClient — Phase 3
 *
 * Client for Gnani Prisma v2.5 Speech-to-Text REST API.
 * Docs: https://docs.gnani.ai/api/STT/speech-to-text
 *
 * Endpoint: POST https://api.vachana.ai/stt/v3
 * Auth header: X-API-Key-ID
 * Form fields:
 *   - audio_file: file (m4a, wav, etc.)
 *   - language_code: BCP-47 code (e.g. hi-IN, en-IN, bn-IN, etc.)
 *   - format: "transcribe" (enables Inverse Text Normalization)
 */
object GnaniSttClient {

    private const val TAG = "GnaniSttClient"
    private const val STT_ENDPOINT = "https://api.vachana.ai/stt/v3"

    /** Default fallback API key provided for the project */
    @Volatile
    var apiKey: String = "vach_1ytE2CY5X2DI7nYe19xQ41pIcF75XgUXXFdRLhu4vuhN2qVlIHYqHNjYbqSZW3pAeBxWsMlcCQBgNUyg9O3hxFQoYUUpobcD_3d238769888eacc65a24109ee5f6fe78"

    /** Current selected language code for transcription (defaults to Hindi/English) */
    @Volatile
    var currentLanguage: String = "hi-IN"

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Transcribes [audioFile] asynchronously and delivers the transcript to [callback]
     * on the OkHttp dispatcher thread.
     */
    fun transcribe(
        audioFile: File,
        languageCode: String = currentLanguage,
        callback: (Result<String>) -> Unit
    ) {
        if (!audioFile.exists() || audioFile.length() == 0L) {
            callback(Result.failure(IllegalArgumentException("Audio file is empty or does not exist.")))
            return
        }

        val requestKey = apiKey.trim()
        if (requestKey.isEmpty()) {
            callback(Result.failure(IllegalStateException("Gnani API key is missing.")))
            return
        }

        val mediaType = "audio/mp4".toMediaTypeOrNull()
        val fileBody = audioFile.asRequestBody(mediaType)

        val multipartBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("audio_file", audioFile.name, fileBody)
            .addFormDataPart("language_code", languageCode)
            .addFormDataPart("format", "transcribe")
            .build()

        val request = Request.Builder()
            .url(STT_ENDPOINT)
            .addHeader("X-API-Key-ID", requestKey)
            .post(multipartBody)
            .build()

        Log.i(TAG, "Sending STT request for file=${audioFile.name} [size=${audioFile.length()}B], lang=$languageCode")

        httpClient.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: IOException) {
                Log.e(TAG, "STT Network request failed: ${e.message}", e)
                callback(Result.failure(e))
                // Clean up audio file
                try { audioFile.delete() } catch (ignored: Exception) {}
            }

            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                val bodyStr = response.body?.string().orEmpty()
                val statusCode = response.code
                Log.d(TAG, "STT Response code: $statusCode, body: $bodyStr")

                try {
                    if (response.isSuccessful) {
                        val json = JSONObject(bodyStr)
                        val success = json.optBoolean("success", false)
                        if (success) {
                            val transcript = json.optString("transcript", "").trim()
                            Log.i(TAG, "STT Successful -> \"$transcript\"")
                            callback(Result.success(transcript))
                        } else {
                            val errorMsg = json.optString("message", "Gnani STT returned success=false")
                            Log.w(TAG, "STT Error: $errorMsg")
                            callback(Result.failure(Exception(errorMsg)))
                        }
                    } else {
                        Log.e(TAG, "STT HTTP Error $statusCode: $bodyStr")
                        callback(Result.failure(Exception("Gnani STT HTTP $statusCode: $bodyStr")))
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "STT JSON parsing failed: ${e.message}", e)
                    callback(Result.failure(e))
                } finally {
                    // Clean up temporary audio file
                    try { audioFile.delete() } catch (ignored: Exception) {}
                }
            }
        })
    }
}

