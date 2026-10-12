package com.tivihub.data.network

import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import org.junit.Assert.assertEquals
import org.junit.Test

class M3uParserTest {
    @Test
    fun parsesQuotedAttributesAndCommaInChannelName() {
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.M3U,
            url = "https://example.com/lists/channels.m3u"
        )
        val input = """
            #EXTM3U
            #EXTINF:-1 tvg-id="news.1" tvg-logo="https://example.com/logo.png" group-title="News, Local" drm-url="https://example.com/license",News, One
            ../live/news.m3u8
        """.trimIndent()

        val channel = M3uParser().parse(input, playlist).single()

        assertEquals("News, One", channel.name)
        assertEquals("News, Local", channel.group)
        assertEquals("news.1", channel.tvgId)
        assertEquals("https://example.com/logo.png", channel.logoUrl)
        assertEquals("https://example.com/license", channel.drmLicenseUrl)
        assertEquals("https://example.com/live/news.m3u8", channel.streamUrl)
    }
}
