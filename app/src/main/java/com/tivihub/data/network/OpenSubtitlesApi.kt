package com.tivihub.data.network

import java.io.IOException
import java.net.URI
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject
import org.json.JSONTokener

data class OpenSubtitleFile(
    val fileId: Long,
    val fileName: String,
    val language: String,
    val release: String?,
    val downloadCount: Long
) {
    val extension: String
        get() = fileName.substringAfterLast('.', "").lowercase()

    val mimeType: String
        get() = when (extension) {
            "vtt" -> "text/vtt"
            else -> "application/x-subrip"
        }

    val displayName: String
        get() = buildString {
            append(language.uppercase())
            if (!release.isNullOrBlank()) append(" · ").append(release)
            append(" · ").append(fileName)
        }
}

data class OpenSubtitleDownload(val fileName: String, val content: ByteArray)

class OpenSubtitlesApi(
    private val http: OkHttpClient = OkHttpClient()
) {
    suspend fun search(apiKey: String, query: String): List<OpenSubtitleFile> =
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            require(apiKey.isNotBlank()) { "Add an OpenSubtitles API key in Settings first." }
            require(query.isNotBlank()) { "Enter a movie or episode title to search." }
            val url = "$BASE_URL/subtitles".toHttpUrl().newBuilder()
                .addQueryParameter("query", query.trim())
                .addQueryParameter("order_by", "download_count")
                .addQueryParameter("order_direction", "desc")
                .build()
            val request = Request.Builder()
                .url(url.toString())
                .header("Api-Key", apiKey)
                .header("User-Agent", USER_AGENT)
                .get()
                .build()
            val payload = executeJson(request, "OpenSubtitles search")
            val results = payload.optJSONArray("data") ?: return@withContext emptyList()
            buildList {
                for (resultIndex in 0 until results.length()) {
                    val attributes = results.optJSONObject(resultIndex)?.optJSONObject("attributes") ?: continue
                    val language = attributes.optString("language").takeIf(String::isNotBlank) ?: "und"
                    val release = attributes.optString("release").takeIf(String::isNotBlank)
                    val downloads = attributes.optLong("download_count")
                    val files = attributes.optJSONArray("files") ?: continue
                    for (fileIndex in 0 until files.length()) {
                        val file = files.optJSONObject(fileIndex) ?: continue
                        val id = file.optLong("file_id", -1L)
                        val name = file.optString("file_name")
                        if (id > 0 && name.substringAfterLast('.', "").lowercase() in SUPPORTED_EXTENSIONS) {
                            add(OpenSubtitleFile(id, name, language, release, downloads))
                        }
                    }
                }
            }
        }

    suspend fun download(apiKey: String, file: OpenSubtitleFile): OpenSubtitleDownload =
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            require(apiKey.isNotBlank()) { "Add an OpenSubtitles API key in Settings first." }
            require(file.extension in SUPPORTED_EXTENSIONS) { "This subtitle format is not supported." }
            val request = Request.Builder()
                .url("$BASE_URL/download")
                .header("Api-Key", apiKey)
                .header("User-Agent", USER_AGENT)
                .header("Content-Type", "application/json")
                .post(JSONObject().put("file_id", file.fileId).toString().toRequestBody(JSON_MEDIA_TYPE))
                .build()
            val downloadInfo = executeJson(request, "OpenSubtitles download request")
            val link = downloadInfo.optString("link").takeIf(String::isNotBlank)
                ?: throw IOException("OpenSubtitles did not provide a download link.")
            require(URI(link).scheme.equals("https", ignoreCase = true)) {
                "OpenSubtitles returned an insecure subtitle download link."
            }
            val downloadRequest = Request.Builder().url(link).get().build()
            http.newCall(downloadRequest).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("Subtitle download failed with HTTP ${response.code}.")
                }
                val body = response.body ?: throw IOException("OpenSubtitles returned an empty subtitle file.")
                if (body.contentLength() > MAX_SUBTITLE_BYTES) {
                    throw IOException("Subtitle file is larger than the supported 5 MB limit.")
                }
                val bytes = body.byteStream().use { stream ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0
                    while (true) {
                        val count = stream.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_SUBTITLE_BYTES) {
                            throw IOException("Subtitle file is larger than the supported 5 MB limit.")
                        }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
                val content = bytes.toString(Charsets.UTF_8)
                if (content.isBlank() || content.startsWith("<!DOCTYPE", ignoreCase = true) ||
                    content.startsWith("<html", ignoreCase = true)
                ) {
                    throw IOException("OpenSubtitles returned an invalid subtitle file.")
                }
                OpenSubtitleDownload(file.fileName, bytes)
            }
        }

    private fun executeJson(request: Request, operation: String): JSONObject =
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("$operation failed with HTTP ${response.code}.")
            }
            val body = response.body ?: throw IOException("$operation returned an empty response.")
            val parsed = JSONTokener(body.string()).nextValue()
            parsed as? JSONObject ?: throw IOException("$operation returned an unexpected response.")
        }

    private companion object {
        const val BASE_URL = "https://api.opensubtitles.com/api/v1"
        const val USER_AGENT = "TiviHub v1.0"
        const val MAX_SUBTITLE_BYTES = 5 * 1024 * 1024
        val SUPPORTED_EXTENSIONS = setOf("srt", "vtt")
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
