package com.tivihub.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.migration.Migration
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlists ORDER BY createdAt")
    fun observeAll(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlists ORDER BY createdAt")
    suspend fun all(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE active = 1 LIMIT 1")
    suspend fun active(): PlaylistEntity?

    @Query("SELECT * FROM playlists WHERE id = :id LIMIT 1")
    suspend fun find(id: String): PlaylistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: PlaylistEntity)

    @Query("UPDATE playlists SET active = 0")
    suspend fun clearActive()

    @Query("UPDATE playlists SET active = 1 WHERE id = :id")
    suspend fun markActive(id: String): Int

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    fun observeAll(): Flow<List<FavoriteEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE contentId = :contentId AND contentType = :contentType AND playlistId = :playlistId")
    suspend fun delete(contentId: String, contentType: String, playlistId: String)

    @Query("DELETE FROM favorites WHERE contentType = 'LIVE'")
    suspend fun deleteLiveFavorites()
}

@Dao
interface LibraryDao {
    @Query("SELECT * FROM library_items ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<LibraryItemEntity>>

    @Query("SELECT * FROM library_items WHERE contentId = :contentId AND contentType = :contentType AND playlistId = :playlistId LIMIT 1")
    suspend fun find(contentId: String, contentType: String, playlistId: String): LibraryItemEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: LibraryItemEntity)

    @Query("DELETE FROM library_items WHERE contentId = :contentId AND contentType = :contentType AND playlistId = :playlistId")
    suspend fun delete(contentId: String, contentType: String, playlistId: String)
}

@Dao
interface CatalogCacheDao {
    @Query("SELECT playlistId, contentType, refreshedAt FROM catalog_cache WHERE playlistId = :playlistId AND contentType = :contentType LIMIT 1")
    suspend fun get(playlistId: String, contentType: String): CatalogCacheEntity?

    @Query("SELECT playlistId, contentType, refreshedAt FROM catalog_cache WHERE playlistId = :playlistId")
    suspend fun getForPlaylist(playlistId: String): List<CatalogCacheEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(entity: CatalogCacheEntity)

    @Query("DELETE FROM catalog_cache WHERE playlistId = :playlistId")
    suspend fun deleteForPlaylist(playlistId: String)
}

@Dao
interface EpgDao {
    @Query("SELECT * FROM epg_programs WHERE channelId = :channelId AND startMillis < :end AND endMillis > :start ORDER BY startMillis")
    fun observePrograms(channelId: String, start: Long, end: Long): Flow<List<EpgProgramEntity>>

    @Query("SELECT * FROM epg_programs WHERE startMillis < :end AND endMillis > :start ORDER BY channelId, startMillis")
    fun observePrograms(start: Long, end: Long): Flow<List<EpgProgramEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun savePrograms(entities: List<EpgProgramEntity>)

    @Query("DELETE FROM epg_programs")
    suspend fun clearPrograms()
}

@Database(
    entities = [PlaylistEntity::class, FavoriteEntity::class, LibraryItemEntity::class, CatalogCacheEntity::class, EpgProgramEntity::class],
    version = 6,
    exportSchema = true
)
abstract class IptvDatabase : RoomDatabase() {
    abstract fun playlistDao(): PlaylistDao
    abstract fun favoriteDao(): FavoriteDao
    abstract fun libraryDao(): LibraryDao
    abstract fun catalogCacheDao(): CatalogCacheDao
    abstract fun epgDao(): EpgDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE playlists ADD COLUMN expiresAtMillis INTEGER")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE TABLE IF NOT EXISTS `library_items` (`id` TEXT NOT NULL, `contentId` TEXT NOT NULL, `contentType` TEXT NOT NULL, `playlistId` TEXT NOT NULL, `title` TEXT NOT NULL, `streamUrl` TEXT, `artworkUrl` TEXT, `status` TEXT NOT NULL, `positionMillis` INTEGER NOT NULL, `durationMillis` INTEGER NOT NULL, `parentId` TEXT, `parentTitle` TEXT, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))"
                )
                database.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS `index_library_items_contentId_contentType_playlistId` ON `library_items` (`contentId`, `contentType`, `playlistId`)"
                )
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE TABLE IF NOT EXISTS `catalog_cache` (`playlistId` TEXT NOT NULL, `contentType` TEXT NOT NULL, `payload` TEXT NOT NULL, `refreshedAt` INTEGER NOT NULL, PRIMARY KEY(`playlistId`, `contentType`))"
                )
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("DROP TABLE IF EXISTS `catalog_cache`")
                database.execSQL(
                    "CREATE TABLE IF NOT EXISTS `catalog_cache` (`playlistId` TEXT NOT NULL, `contentType` TEXT NOT NULL, `refreshedAt` INTEGER NOT NULL, PRIMARY KEY(`playlistId`, `contentType`))"
                )
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("DROP TABLE IF EXISTS `epg_sources`")
            }
        }
    }
}
