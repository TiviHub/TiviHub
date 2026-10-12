package com.tivihub.data.network

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenSubtitlesApiTest {
    @Test
    fun searchAddsApiKeyAndReturnsOnlySupportedSubtitleFiles() = runBlocking {
        var requestedQuery = ""
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                assertEquals("test-api-key", chain.request().header("Api-Key"))
                requestedQuery = chain.request().url.queryParameter("query").orEmpty()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """
                        {
                          "data": [{
                            "attributes": {
                              "language": "en",
                              "release": "WEB",
                              "download_count": 12,
                              "files": [
                                {"file_id": 54, "file_name": "movie.en.srt"},
                                {"file_id": 55, "file_name": "movie.zip"}
                              ]
                            }
                          }]
                        }
                        """.trimIndent().toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val files = OpenSubtitlesApi(client).search("test-api-key", "The Example")

        assertEquals("The Example", requestedQuery)
        assertEquals(1, files.size)
        assertEquals(54L, files.single().fileId)
        assertEquals("en", files.single().language)
        assertEquals("movie.en.srt", files.single().fileName)
    }

    @Test
    fun downloadsSelectedSubtitleUsingApiFileId() = runBlocking {
        var apiKeyWasSent = false
        var fileIdWasSent = false
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                when (request.url.encodedPath) {
                    "/api/v1/download" -> {
                        apiKeyWasSent = request.header("Api-Key") == "test-api-key"
                        fileIdWasSent = request.body?.let { body ->
                            val buffer = okio.Buffer()
                            body.writeTo(buffer)
                            buffer.readUtf8().contains("\"file_id\":54")
                        } == true
                        Response.Builder()
                            .request(request)
                            .protocol(Protocol.HTTP_1_1)
                            .code(200)
                            .message("OK")
                            .body(
                                """{"link":"https://download.example/subtitle.srt"}"""
                                    .toResponseBody("application/json".toMediaType())
                            )
                            .build()
                    }
                    "/subtitle.srt" -> Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .body("1\n00:00:01,000 --> 00:00:02,000\nHello\n".toResponseBody())
                        .build()
                    else -> error("Unexpected request path.")
                }
            }
            .build()
        val file = OpenSubtitleFile(54, "movie.srt", "en", null, 1)

        val result = OpenSubtitlesApi(client).download("test-api-key", file)

        assertTrue(apiKeyWasSent)
        assertTrue(fileIdWasSent)
        assertEquals("movie.srt", result.fileName)
        assertTrue(result.content.toString(Charsets.UTF_8).contains("Hello"))
    }
}
