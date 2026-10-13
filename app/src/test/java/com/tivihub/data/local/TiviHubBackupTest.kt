package com.tivihub.data.local

import com.tivihub.data.model.ContentType
import com.tivihub.data.model.Favorite
import com.tivihub.data.model.LibraryItem
import com.tivihub.data.model.LibraryStatus
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class TiviHubBackupTest {
    private val backup = TiviHubBackup(
        playlists = listOf(
            Playlist(
                id = "playlist-1",
                name = "My playlist",
                type = PlaylistType.XTREAM,
                url = "https://example.test/player_api.php",
                username = "private-user",
                password = "private-password",
                active = true
            )
        ),
        favorites = listOf(
            Favorite(
                id = "favorite-1",
                contentId = "channel-1",
                contentType = ContentType.LIVE,
                title = "Channel",
                playlistId = "playlist-1",
                streamUrl = "https://example.test/live/private-user/private-password/1.m3u8",
                artworkUrl = null,
                addedAt = 123L
            )
        ),
        libraryItems = listOf(
            LibraryItem(
                id = "library-1",
                contentId = "movie-1",
                contentType = ContentType.MOVIE,
                playlistId = "playlist-1",
                title = "Movie",
                streamUrl = "https://example.test/movie/1",
                artworkUrl = "https://example.test/poster.jpg",
                status = LibraryStatus.WATCHING,
                positionMillis = 60_000,
                durationMillis = 120_000,
                updatedAt = 456L
            )
        ),
        preferences = BackupPreferences(
            theme = "dark",
            catalogColumns = 3,
            autoRefresh = false,
            catalogRefreshInterval = "WEEKLY",
            epgRefreshInterval = "DAILY",
            openSubtitlesApiKey = "private-api-key"
        )
    )

    @Test
    fun encryptedBackupRoundTripsAllUserDataAndCredentials() {
        val password = "a-long-backup-password".toCharArray()

        val encrypted = TiviHubBackupFile.encrypt(backup, password)
        val restored = TiviHubBackupFile.decrypt(encrypted, password)

        assertEquals(backup, restored)
        assertEquals("TIVIBAK".toByteArray(Charsets.US_ASCII).toList(), encrypted.take(7))
        val fileContents = encrypted.toString(Charsets.ISO_8859_1)
        assertFalse(fileContents.contains("private-user"))
        assertFalse(fileContents.contains("private-password"))
        assertFalse(fileContents.contains("private-api-key"))
    }

    @Test
    fun wrongPasswordAndTamperingAreRejected() {
        val encrypted = TiviHubBackupFile.encrypt(backup, "correct-password".toCharArray())

        assertThrows(IllegalArgumentException::class.java) {
            TiviHubBackupFile.decrypt(encrypted, "incorrect-password".toCharArray())
        }

        encrypted[encrypted.lastIndex] = (encrypted.last().toInt() xor 1).toByte()
        assertThrows(IllegalArgumentException::class.java) {
            TiviHubBackupFile.decrypt(encrypted, "correct-password".toCharArray())
        }
    }

    @Test
    fun passwordMustMeetMinimumLength() {
        assertThrows(IllegalArgumentException::class.java) {
            TiviHubBackupFile.encrypt(backup, "short".toCharArray())
        }
    }
}
