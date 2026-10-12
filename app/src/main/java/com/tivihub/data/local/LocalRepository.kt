package com.tivihub.data.local

import androidx.room.withTransaction
import java.io.Reader
import java.io.File
import java.io.IOException
import java.io.Writer
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import com.tivihub.data.model.ContentType
import com.tivihub.data.model.EpgProgram
import com.tivihub.data.model.Favorite
import com.tivihub.data.model.LibraryItem
import com.tivihub.data.model.LibraryStatus
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LocalRepository(
    private val database: IptvDatabase,
    private val cipher: CredentialCipher,
    private val filesDirectory: File
) {
    val playlists: Flow<List<Playlist>> = database.playlistDao().observeAll().map { rows ->
        rows.map(::toPlaylist)
    }
    val favorites: Flow<List<Favorite>> = database.favoriteDao().observeAll().map { rows ->
        rows.map(FavoriteEntity::toFavorite)
    }
    val libraryItems: Flow<List<LibraryItem>> = database.libraryDao().observeAll().map { rows ->
        rows.map(LibraryItemEntity::toLibraryItem)
    }
    suspend fun allPlaylists() = database.playlistDao().all().map(::toPlaylist)
    suspend fun activePlaylist() = database.playlistDao().active()?.let(::toPlaylist)

    suspend fun savePlaylist(playlist: Playlist) {
        database.withTransaction {
            val previous = database.playlistDao().find(playlist.id)?.let(::toPlaylist)
            if (previous != null && (
                    previous.type != playlist.type ||
                        previous.url != playlist.url ||
                        previous.username != playlist.username ||
                        previous.password != playlist.password
                    )
            ) {
                database.catalogCacheDao().deleteForPlaylist(playlist.id)
                deleteCatalogFiles(playlist.id)
            }
            database.playlistDao().save(
                PlaylistEntity(
                    id = playlist.id,
                    name = playlist.name,
                    type = playlist.type.name,
                    url = playlist.url,
                    usernameEncrypted = cipher.encrypt(playlist.username),
                    passwordEncrypted = cipher.encrypt(playlist.password),
                    active = playlist.active,
                    drmLicenseUrl = playlist.drmLicenseUrl,
                    expiresAtMillis = playlist.expiresAtMillis,
                    createdAt = playlist.createdAt
                )
            )
        }
    }

    suspend fun setActivePlaylist(id: String) {
        database.withTransaction {
            database.playlistDao().clearActive()
            check(database.playlistDao().markActive(id) == 1) { "Playlist not found." }
        }
    }

    suspend fun deletePlaylist(id: String) {
        database.withTransaction {
            database.playlistDao().delete(id)
            database.catalogCacheDao().deleteForPlaylist(id)
        }
        deleteCatalogFiles(id)
    }
    suspend fun addFavorite(favorite: Favorite) = database.favoriteDao().save(favorite.toEntity())
    suspend fun removeFavorite(favorite: Favorite) {
        database.favoriteDao().delete(favorite.contentId, favorite.contentType.name, favorite.playlistId)
    }
    suspend fun removeLiveFavorites() = database.favoriteDao().deleteLiveFavorites()
    suspend fun findLibraryItem(contentId: String, contentType: ContentType, playlistId: String) =
        database.libraryDao().find(contentId, contentType.name, playlistId)?.toLibraryItem()
    suspend fun saveLibraryItem(item: LibraryItem) = database.libraryDao().save(item.toEntity())
    suspend fun removeLibraryItem(item: LibraryItem) {
        database.libraryDao().delete(item.contentId, item.contentType.name, item.playlistId)
    }
    suspend fun <T> cachedCatalog(
        playlistId: String,
        contentType: String,
        decode: (Reader) -> T,
        cacheVersion: Int = 0
    ): Pair<T, Long>? =
        withContext(Dispatchers.IO) {
            val metadata = database.catalogCacheDao().get(playlistId, contentType) ?: return@withContext null
            val file = catalogFile(playlistId, contentType, cacheVersion)
            if (!file.isFile) return@withContext null
            try {
                file.bufferedReader().use(decode) to metadata.refreshedAt
            } catch (error: IOException) {
                throw IOException("Could not read cached $contentType catalog.", error)
            }
        }

    suspend fun catalogRefreshTimes(playlistId: String): Map<String, Long> =
        database.catalogCacheDao().getForPlaylist(playlistId)
            .associate { it.contentType to it.refreshedAt }

    suspend fun saveCatalog(
        playlistId: String,
        contentType: String,
        refreshedAt: Long,
        cacheVersion: Int = 0,
        writePayload: (Writer) -> Unit
    ) {
        withContext(Dispatchers.IO) {
            val file = catalogFile(playlistId, contentType, cacheVersion)
            val temp = File(file.parentFile, "${file.name}.tmp")
            try {
                file.parentFile?.mkdirs()
                temp.bufferedWriter().use(writePayload)
                try {
                    Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
                } catch (_: AtomicMoveNotSupportedException) {
                    Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
                }
                database.catalogCacheDao().save(CatalogCacheEntity(playlistId, contentType, refreshedAt))
            } catch (error: Exception) {
                if (temp.exists() && !temp.delete()) {
                    error.addSuppressed(IOException("Could not clean up temporary catalog cache."))
                }
                throw error
            }
        }
    }

    private fun catalogFile(playlistId: String, contentType: String, cacheVersion: Int): File {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(playlistId.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val versionSuffix = if (cacheVersion == 0) "" else "_v$cacheVersion"
        return File(File(filesDirectory, "catalog-cache"), "${digest}_$contentType$versionSuffix.json")
    }

    private fun deleteCatalogFiles(playlistId: String) {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(playlistId.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val directory = File(filesDirectory, "catalog-cache")
        val files = directory.listFiles { file -> file.name.startsWith("${digest}_") } ?: return
        files.forEach { file ->
            if (file.exists() && !file.delete()) {
                throw IOException("Could not delete a cached catalog.")
            }
        }
    }

    fun programs(channelId: String, start: Long, end: Long): Flow<List<EpgProgram>> =
        database.epgDao().observePrograms(channelId, start, end).map { it.map(EpgProgramEntity::toProgram) }

    fun guidePrograms(start: Long, end: Long): Flow<List<EpgProgram>> =
        database.epgDao().observePrograms(start, end).map { it.map(EpgProgramEntity::toProgram) }

    suspend fun cachePrograms(programs: List<EpgProgram>) {
        database.epgDao().savePrograms(programs.map(EpgProgram::toEntity))
    }

    suspend fun replacePrograms(programs: List<EpgProgram>) {
        database.withTransaction {
            database.epgDao().clearPrograms()
            database.epgDao().savePrograms(programs.map(EpgProgram::toEntity))
        }
    }

    suspend fun clearGuideCache() = database.epgDao().clearPrograms()

    private fun toPlaylist(entity: PlaylistEntity) = Playlist(
        id = entity.id,
        name = entity.name,
        type = PlaylistType.valueOf(entity.type),
        url = entity.url,
        username = cipher.decrypt(entity.usernameEncrypted),
        password = cipher.decrypt(entity.passwordEncrypted),
        active = entity.active,
        drmLicenseUrl = entity.drmLicenseUrl,
        expiresAtMillis = entity.expiresAtMillis,
        createdAt = entity.createdAt
    )
}

private fun FavoriteEntity.toFavorite() = Favorite(
    id = id,
    contentId = contentId,
    contentType = ContentType.valueOf(contentType),
    title = title,
    playlistId = playlistId,
    streamUrl = streamUrl,
    artworkUrl = artworkUrl,
    addedAt = addedAt
)

private fun LibraryItemEntity.toLibraryItem() = LibraryItem(
    id = id,
    contentId = contentId,
    contentType = ContentType.valueOf(contentType),
    playlistId = playlistId,
    title = title,
    streamUrl = streamUrl,
    artworkUrl = artworkUrl,
    status = LibraryStatus.valueOf(status),
    positionMillis = positionMillis,
    durationMillis = durationMillis,
    parentId = parentId,
    parentTitle = parentTitle,
    updatedAt = updatedAt
)

private fun LibraryItem.toEntity() = LibraryItemEntity(
    id = id,
    contentId = contentId,
    contentType = contentType.name,
    playlistId = playlistId,
    title = title,
    streamUrl = streamUrl,
    artworkUrl = artworkUrl,
    status = status.name,
    positionMillis = positionMillis,
    durationMillis = durationMillis,
    parentId = parentId,
    parentTitle = parentTitle,
    updatedAt = updatedAt
)

private fun Favorite.toEntity() = FavoriteEntity(
    id = id,
    contentId = contentId,
    contentType = contentType.name,
    title = title,
    playlistId = playlistId,
    streamUrl = streamUrl,
    artworkUrl = artworkUrl,
    addedAt = addedAt
)

private fun EpgProgramEntity.toProgram() = EpgProgram(
    id = id,
    channelId = channelId,
    title = title,
    synopsis = synopsis,
    startMillis = startMillis,
    endMillis = endMillis,
    source = source
)

private fun EpgProgram.toEntity() = EpgProgramEntity(
    id = id,
    channelId = channelId,
    title = title,
    synopsis = synopsis,
    startMillis = startMillis,
    endMillis = endMillis,
    source = source
)
