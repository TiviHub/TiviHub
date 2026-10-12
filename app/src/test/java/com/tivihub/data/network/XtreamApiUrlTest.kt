package com.tivihub.data.network

import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import org.junit.Assert.assertEquals
import org.junit.Test

class XtreamApiUrlTest {
    private val api = XtreamApi()

    @Test
    fun apiQueryEncodesCredentialsAndPreservesPlayerApiPath() {
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.XTREAM,
            url = "https://example.com/prefix/player_api.php",
            username = "first+last",
            password = "p @/word"
        )

        val url = api.apiUrl(playlist, action = "get_series_info", extra = mapOf("series_id" to "a&b"))

        assertEquals(
            "https://example.com/prefix/player_api.php?username=first%2Blast&password=p+%40%2Fword&action=get_series_info&series_id=a%26b",
            url
        )
    }

    @Test
    fun streamPathEncodesCredentialsAsIndividualPathSegments() {
        val playlist = Playlist(
            name = "Test",
            type = PlaylistType.XTREAM,
            url = "https://example.com/prefix/player_api.php",
            username = "name/one",
            password = "pass word"
        )

        assertEquals(
            "https://example.com/prefix/movie/name%2Fone/pass%20word/17.mp4",
            api.streamUrl(playlist, "movie", "17", "mp4")
        )
    }
}
