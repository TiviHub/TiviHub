package com.tivihub.data.network

import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class XtreamCategoriesTest {
    @Test
    fun liveCategoryHttpErrorsIdentifyTheXtreamRequest() = runBlocking {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                val response = if (request.url.queryParameter("action") == null) {
                    Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .body(
                            """{"user_info":{"auth":1,"status":"Active","exp_date":"1700000000"}}"""
                                .toResponseBody("application/json".toMediaType())
                        )
                        .build()
                } else {
                    Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(404)
                        .message("Not Found")
                        .body("Not Found".toResponseBody())
                        .build()
                }
                response
            }
            .build()
        val api = XtreamApi(http = client)
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.XTREAM,
            url = "https://example.com",
            username = "test-user",
            password = "test-pass"
        )

        val error = runCatching { api.liveChannels(playlist) }.exceptionOrNull()

        assertTrue(error?.message.orEmpty().contains("Xtream live categories request failed with HTTP 404"))
    }

    @Test
    fun moviesAndSeriesCarryTheirProviderCategoryNames() = runBlocking {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
                val action = request.url.queryParameter("action")
                val body = when (action) {
                    null -> """{"user_info":{"auth":1,"status":"Active"}}"""
                    "get_vod_categories" ->
                        """[{"category_id":"7","category_name":"Documentaries"}]"""
                    "get_vod_streams" ->
                        """[{"stream_id":12,"name":"Planet Earth","category_id":"7","added":"1700000000","rating":"8.5","releasedate":"2024-01-01"}]"""
                    "get_series_categories" ->
                        """[{"category_id":"3","category_name":"Drama"}]"""
                    "get_series" ->
                        """[{"series_id":42,"name":"Sample Series","category_id":"3","last_modified":"1700000001","rating_5based":"4.5","year":"2023"}]"""
                    else -> error("Unexpected Xtream action: $action")
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
            username = "test-user",
            password = "test-pass"
        )

        val movie = api.movies(playlist).single()
        val series = api.series(playlist).single()

        assertEquals("7", movie.categoryId)
        assertEquals("Documentaries", movie.category)
        assertEquals(1_700_000_000_000L, movie.addedAtMillis)
        assertEquals(2024, movie.year)
        assertEquals(8.5, movie.rating ?: -1.0, 0.0)
        assertEquals("3", series.categoryId)
        assertEquals("Drama", series.category)
        assertEquals(1_700_000_001_000L, series.addedAtMillis)
        assertEquals(2023, series.year)
        assertEquals(4.5, series.rating ?: -1.0, 0.0)
    }
}
