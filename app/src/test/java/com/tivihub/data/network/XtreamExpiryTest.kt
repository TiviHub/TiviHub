package com.tivihub.data.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType

class XtreamExpiryTest {
    private val api = XtreamApi()

    @Test
    fun parsesUnixSecondsAndMilliseconds() {
        assertEquals(1_700_000_000_000L, api.parseXtreamExpiryMillis("1700000000"))
        assertEquals(1_700_000_000_000L, api.parseXtreamExpiryMillis("1700000000000"))
    }

    @Test
    fun parsesIsoDates() {
        assertEquals(1_700_000_000_000L, api.parseXtreamExpiryMillis("2023-11-14T22:13:20Z"))
        assertEquals(1_704_067_200_000L, api.parseXtreamExpiryMillis("2024-01-01"))
    }

    @Test
    fun treatsMissingNeverAndInvalidDatesAsNoExpiry() {
        assertNull(api.parseXtreamExpiryMillis(null))
        assertNull(api.parseXtreamExpiryMillis(""))
        assertNull(api.parseXtreamExpiryMillis("null"))
        assertNull(api.parseXtreamExpiryMillis("0"))
        assertNull(api.parseXtreamExpiryMillis("never"))
    }

    @Test
    fun authenticateFetchesExpiryFromXtreamUserInfo() = runBlocking {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request()
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
            }
            .build()
        val testApi = XtreamApi(http = client)
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.XTREAM,
            url = "https://example.com",
            username = "test",
            password = "test"
        )

        assertEquals(1_700_000_000_000L, testApi.authenticate(playlist))
    }
}
