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
import java.time.Instant

class XtreamEpgTest {
    @Test
    fun playlistEpgBuildsAuthenticatedXmltvUrlAndParsesProgrammes() = runBlocking {
        var requestedUrl = ""
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                requestedUrl = chain.request().url.toString()
                val body = """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <tv>
                      <programme channel="channel.1" start="20261012180000 +0000" stop="20261012190000 +0000">
                        <title>Evening News</title>
                        <desc>Daily headlines</desc>
                      </programme>
                    </tv>
                """.trimIndent()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("application/xml".toMediaType()))
                    .build()
            }
            .build()
        val api = XtreamApi(http = client)
        val playlist = Playlist(
            name = "Provider",
            type = PlaylistType.XTREAM,
            url = "https://example.com/iptv/player_api.php",
            username = "user name",
            password = "p&ss"
        )

        val programs = api.epg(
            playlist,
            Instant.parse("2026-10-12T17:00:00Z").toEpochMilli(),
            Instant.parse("2026-10-12T20:00:00Z").toEpochMilli()
        )

        assertTrue(requestedUrl.startsWith("https://example.com/iptv/xmltv.php?"))
        assertTrue(requestedUrl.contains("username=user+name"))
        assertTrue(requestedUrl.contains("password=p%26ss"))
        assertEquals(1, programs.size)
        assertEquals("channel.1", programs.single().channelId)
        assertEquals("Evening News", programs.single().title)
        assertEquals("Daily headlines", programs.single().synopsis)
    }

    @Test
    fun xmltvUrlSupportsPlaylistServerRoot() {
        val api = XtreamApi()
        val playlist = Playlist(
            name = "Provider",
            type = PlaylistType.XTREAM,
            url = "https://example.com",
            username = "user",
            password = "pass"
        )

        assertEquals("https://example.com/xmltv.php?username=user&password=pass", api.xmltvUrl(playlist))
    }
}
