package com.tivihub.data.network

import com.tivihub.data.model.Movie
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test

class XtreamMovieDetailsTest {
    @Test
    fun movieDetailsLoadsSynopsisAndUsesProviderContainerExtension() = runBlocking {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                val body = when (request.url.queryParameter("action")) {
                    null -> """{"user_info":{"auth":1,"status":"Active"}}"""
                    "get_vod_info" ->
                        """{"info":{"plot":"A detailed synopsis","movie_image":"https://example.com/poster.jpg","releasedate":"2024-02-03","rating":"8.4"},"movie_data":{"container_extension":"mkv"}}"""
                    else -> error("Unexpected Xtream request: ${request.url}")
                }
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()
        val api = XtreamApi(http = client)
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.XTREAM,
            url = "https://example.com",
            username = "user",
            password = "pass"
        )
        val movie = Movie(
            id = "123",
            name = "Test Movie",
            streamUrl = "https://example.com/movie/user/pass/123.mp4"
        )

        val details = api.movieDetails(playlist, movie)

        assertEquals("A detailed synopsis", details.overview)
        assertEquals("https://example.com/poster.jpg", details.posterUrl)
        assertEquals(2024, details.year)
        assertEquals(8.4, details.rating!!, 0.0)
        assertEquals("https://example.com/movie/user/pass/123.mkv", details.streamUrl)
    }
}
