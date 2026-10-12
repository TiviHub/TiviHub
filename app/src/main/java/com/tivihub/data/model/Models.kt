package com.tivihub.data.model

import java.util.UUID

enum class PlaylistType { M3U, XTREAM }
enum class ContentType { LIVE, MOVIE, SERIES, EPISODE }
enum class LibraryStatus { WATCHLIST, WATCHING, WATCHED }

data class Playlist(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val type: PlaylistType,
    val url: String,
    val username: String = "",
    val password: String = "",
    val active: Boolean = false,
    val drmLicenseUrl: String = "",
    val expiresAtMillis: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
)

data class LiveChannel(
    val id: String = UUID.randomUUID().toString(),
    val playlistId: String,
    val name: String,
    val group: String = "General",
    val streamUrl: String,
    val logoUrl: String? = null,
    val tvgId: String? = null,
    val drmLicenseUrl: String? = null
)

data class Movie(
    val id: String,
    val name: String,
    val streamUrl: String,
    val posterUrl: String? = null,
    val overview: String? = null,
    val year: Int? = null,
    val rating: Double? = null,
    val categoryId: String? = null,
    val category: String? = null,
    val addedAtMillis: Long? = null
)

data class Series(
    val id: String,
    val name: String,
    val posterUrl: String? = null,
    val overview: String? = null,
    val seasons: Int = 0,
    val categoryId: String? = null,
    val category: String? = null,
    val year: Int? = null,
    val rating: Double? = null,
    val addedAtMillis: Long? = null
)

data class Episode(
    val id: String,
    val seriesId: String,
    val season: Int,
    val number: Int,
    val name: String,
    val streamUrl: String,
    val overview: String? = null,
    val posterUrl: String? = null
)

data class Favorite(
    val id: String = UUID.randomUUID().toString(),
    val contentId: String,
    val contentType: ContentType,
    val title: String,
    val playlistId: String,
    val streamUrl: String?,
    val artworkUrl: String?,
    val addedAt: Long = System.currentTimeMillis()
)

data class LibraryItem(
    val id: String = UUID.randomUUID().toString(),
    val contentId: String,
    val contentType: ContentType,
    val playlistId: String,
    val title: String,
    val streamUrl: String?,
    val artworkUrl: String?,
    val status: LibraryStatus,
    val positionMillis: Long = 0,
    val durationMillis: Long = 0,
    val parentId: String? = null,
    val parentTitle: String? = null,
    val updatedAt: Long = System.currentTimeMillis()
)

data class EpgProgram(
    val id: String = UUID.randomUUID().toString(),
    val channelId: String,
    val title: String,
    val synopsis: String?,
    val startMillis: Long,
    val endMillis: Long,
    val source: String
)
