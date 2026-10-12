package com.tivihub.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val url: String,
    val usernameEncrypted: String,
    val passwordEncrypted: String,
    val active: Boolean,
    val drmLicenseUrl: String,
    val expiresAtMillis: Long?,
    val createdAt: Long
)

@Entity(
    tableName = "favorites",
    indices = [Index(value = ["contentId", "contentType", "playlistId"], unique = true)]
)
data class FavoriteEntity(
    @PrimaryKey val id: String,
    val contentId: String,
    val contentType: String,
    val title: String,
    val playlistId: String,
    val streamUrl: String?,
    val artworkUrl: String?,
    val addedAt: Long
)

@Entity(
    tableName = "library_items",
    indices = [Index(value = ["contentId", "contentType", "playlistId"], unique = true)]
)
data class LibraryItemEntity(
    @PrimaryKey val id: String,
    val contentId: String,
    val contentType: String,
    val playlistId: String,
    val title: String,
    val streamUrl: String?,
    val artworkUrl: String?,
    val status: String,
    val positionMillis: Long,
    val durationMillis: Long,
    val parentId: String?,
    val parentTitle: String?,
    val updatedAt: Long
)

@Entity(
    tableName = "catalog_cache",
    primaryKeys = ["playlistId", "contentType"]
)
data class CatalogCacheEntity(
    val playlistId: String,
    val contentType: String,
    val refreshedAt: Long
)

@Entity(
    tableName = "epg_programs",
    indices = [Index(value = ["channelId", "startMillis"])]
)
data class EpgProgramEntity(
    @PrimaryKey val id: String,
    val channelId: String,
    val title: String,
    val synopsis: String?,
    val startMillis: Long,
    val endMillis: Long,
    val source: String
)
