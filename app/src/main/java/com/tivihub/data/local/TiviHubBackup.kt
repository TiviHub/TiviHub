package com.tivihub.data.local

import com.tivihub.data.model.ContentType
import com.tivihub.data.model.Favorite
import com.tivihub.data.model.LibraryItem
import com.tivihub.data.model.LibraryStatus
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONObject

data class BackupPreferences(
    val theme: String,
    val catalogColumns: Int,
    val autoRefresh: Boolean,
    val catalogRefreshInterval: String,
    val epgRefreshInterval: String,
    val openSubtitlesApiKey: String
)

data class TiviHubBackup(
    val playlists: List<Playlist>,
    val favorites: List<Favorite>,
    val libraryItems: List<LibraryItem>,
    val preferences: BackupPreferences
)

data class BackupSummary(
    val playlistCount: Int,
    val favoriteCount: Int,
    val libraryCount: Int
)

data class BackupDisplaySettings(
    val theme: String,
    val catalogColumns: Int
)

object TiviHubBackupFile {
    private val magic = "TIVIBAK".toByteArray(Charsets.US_ASCII)
    private const val FORMAT_VERSION = 1
    private const val SALT_SIZE = 16
    private const val IV_SIZE = 12
    private const val HEADER_SIZE = 7 + 1 + SALT_SIZE + IV_SIZE
    private const val KEY_SIZE_BITS = 256
    private const val KDF_ITERATIONS = 210_000
    private const val GCM_TAG_BITS = 128
    const val MAX_FILE_SIZE = 64 * 1024 * 1024
    const val MIN_PASSWORD_LENGTH = 8

    fun encrypt(backup: TiviHubBackup, password: CharArray): ByteArray {
        require(password.size >= MIN_PASSWORD_LENGTH) {
            "Choose a backup password with at least $MIN_PASSWORD_LENGTH characters."
        }
        require(password.size <= 1024) { "Backup password is too long." }
        val salt = ByteArray(SALT_SIZE).also(SecureRandom()::nextBytes)
        val iv = ByteArray(IV_SIZE).also(SecureRandom()::nextBytes)
        val header = ByteArrayOutputStream(HEADER_SIZE).use { output ->
            DataOutputStream(output).use { data ->
                data.write(magic)
                data.writeByte(FORMAT_VERSION)
                data.write(salt)
                data.write(iv)
            }
            output.toByteArray()
        }
        val plaintext = encode(backup)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, deriveKey(password, salt), GCMParameterSpec(GCM_TAG_BITS, iv))
            cipher.updateAAD(header)
            val file = header + cipher.doFinal(plaintext)
            require(file.size <= MAX_FILE_SIZE) { "Backup is too large to export." }
            file
        } finally {
            plaintext.fill(0)
        }
    }

    fun decrypt(file: ByteArray, password: CharArray): TiviHubBackup {
        require(password.size in MIN_PASSWORD_LENGTH..1024) {
            "Enter the backup password (at least $MIN_PASSWORD_LENGTH characters)."
        }
        require(file.size in (HEADER_SIZE + GCM_TAG_BITS / 8)..MAX_FILE_SIZE) {
            "This is not a valid TiviHub backup file."
        }
        val input = DataInputStream(ByteArrayInputStream(file))
        val actualMagic = ByteArray(magic.size)
        input.readFully(actualMagic)
        require(actualMagic.contentEquals(magic)) { "This is not a TiviHub backup file." }
        val version = input.readUnsignedByte()
        require(version == FORMAT_VERSION) { "This TiviHub backup version is not supported." }
        val salt = ByteArray(SALT_SIZE)
        input.readFully(salt)
        val iv = ByteArray(IV_SIZE)
        input.readFully(iv)
        val header = file.copyOfRange(0, HEADER_SIZE)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, deriveKey(password, salt), GCMParameterSpec(GCM_TAG_BITS, iv))
        cipher.updateAAD(header)
        val plaintext = try {
            cipher.doFinal(file, HEADER_SIZE, file.size - HEADER_SIZE)
        } catch (error: AEADBadTagException) {
            throw IllegalArgumentException("The backup password is incorrect or the file has been damaged.", error)
        }
        return try {
            decode(plaintext)
        } finally {
            plaintext.fill(0)
        }
    }

    private fun deriveKey(password: CharArray, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(password, salt, KDF_ITERATIONS, KEY_SIZE_BITS)
        return try {
            val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec)
                .encoded
            SecretKeySpec(key, "AES")
        } finally {
            spec.clearPassword()
        }
    }

    private fun encode(backup: TiviHubBackup): ByteArray {
        val root = JSONObject()
            .put("version", FORMAT_VERSION)
            .put("playlists", JSONArray().apply { backup.playlists.forEach { put(it.toJson()) } })
            .put("favorites", JSONArray().apply { backup.favorites.forEach { put(it.toJson()) } })
            .put("libraryItems", JSONArray().apply { backup.libraryItems.forEach { put(it.toJson()) } })
            .put("preferences", backup.preferences.toJson())
        val bytes = root.toString().toByteArray(Charsets.UTF_8)
        require(bytes.size <= MAX_FILE_SIZE - HEADER_SIZE) { "Backup is too large to export." }
        return bytes
    }

    private fun decode(bytes: ByteArray): TiviHubBackup {
        try {
            val root = JSONObject(String(bytes, Charsets.UTF_8))
            require(root.getInt("version") == FORMAT_VERSION) { "This TiviHub backup version is not supported." }
            val playlists = root.getJSONArray("playlists").mapObjects(::playlistFromJson)
            val favorites = root.getJSONArray("favorites").mapObjects(::favoriteFromJson)
            val libraryItems = root.getJSONArray("libraryItems").mapObjects(::libraryItemFromJson)
            val preferences = preferencesFromJson(root.getJSONObject("preferences"))
            require(playlists.map(Playlist::id).distinct().size == playlists.size) {
                "The backup contains duplicate playlists."
            }
            require(playlists.count(Playlist::active) <= 1) {
                "The backup contains multiple active playlists."
            }
            val playlistIds = playlists.mapTo(mutableSetOf(), Playlist::id)
            require(favorites.all { it.playlistId in playlistIds } &&
                libraryItems.all { it.playlistId in playlistIds }
            ) { "The backup contains items without a matching playlist." }
            require(favorites.map(Favorite::id).distinct().size == favorites.size) {
                "The backup contains duplicate favorite identifiers."
            }
            require(libraryItems.map(LibraryItem::id).distinct().size == libraryItems.size) {
                "The backup contains duplicate library identifiers."
            }
            require(favorites.map { Triple(it.contentId, it.contentType, it.playlistId) }.distinct().size == favorites.size) {
                "The backup contains duplicate favorites."
            }
            require(libraryItems.map { Triple(it.contentId, it.contentType, it.playlistId) }.distinct().size == libraryItems.size) {
                "The backup contains duplicate library items."
            }
            require(favorites.all { it.id.isNotBlank() && it.contentId.isNotBlank() && it.title.isNotBlank() } &&
                libraryItems.all { it.id.isNotBlank() && it.contentId.isNotBlank() && it.title.isNotBlank() }
            ) { "The backup contains an invalid favorite or library item." }
            return TiviHubBackup(playlists, favorites, libraryItems, preferences)
        } catch (error: IllegalArgumentException) {
            throw error
        } catch (error: Exception) {
            throw IllegalArgumentException("The backup contents are invalid or incomplete.", error)
        }
    }

    private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
        List(length()) { index -> transform(getJSONObject(index)) }

    private fun Playlist.toJson() = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("type", type.name)
        .put("url", url)
        .put("username", username)
        .put("password", password)
        .put("active", active)
        .put("drmLicenseUrl", drmLicenseUrl)
        .putNullable("expiresAtMillis", expiresAtMillis)
        .put("createdAt", createdAt)

    private fun playlistFromJson(item: JSONObject) = Playlist(
        id = item.getString("id"),
        name = item.getString("name"),
        type = PlaylistType.valueOf(item.getString("type")),
        url = item.getString("url"),
        username = item.getString("username"),
        password = item.getString("password"),
        active = item.getBoolean("active"),
        drmLicenseUrl = item.getString("drmLicenseUrl"),
        expiresAtMillis = item.optionalLong("expiresAtMillis"),
        createdAt = item.getLong("createdAt")
    )

    private fun Favorite.toJson() = JSONObject()
        .put("id", id)
        .put("contentId", contentId)
        .put("contentType", contentType.name)
        .put("title", title)
        .put("playlistId", playlistId)
        .putNullable("streamUrl", streamUrl)
        .putNullable("artworkUrl", artworkUrl)
        .put("addedAt", addedAt)

    private fun favoriteFromJson(item: JSONObject) = Favorite(
        id = item.getString("id"),
        contentId = item.getString("contentId"),
        contentType = ContentType.valueOf(item.getString("contentType")),
        title = item.getString("title"),
        playlistId = item.getString("playlistId"),
        streamUrl = item.optionalString("streamUrl"),
        artworkUrl = item.optionalString("artworkUrl"),
        addedAt = item.getLong("addedAt")
    )

    private fun LibraryItem.toJson() = JSONObject()
        .put("id", id)
        .put("contentId", contentId)
        .put("contentType", contentType.name)
        .put("playlistId", playlistId)
        .put("title", title)
        .putNullable("streamUrl", streamUrl)
        .putNullable("artworkUrl", artworkUrl)
        .put("status", status.name)
        .put("positionMillis", positionMillis)
        .put("durationMillis", durationMillis)
        .putNullable("parentId", parentId)
        .putNullable("parentTitle", parentTitle)
        .put("updatedAt", updatedAt)

    private fun libraryItemFromJson(item: JSONObject) = LibraryItem(
        id = item.getString("id"),
        contentId = item.getString("contentId"),
        contentType = ContentType.valueOf(item.getString("contentType")),
        playlistId = item.getString("playlistId"),
        title = item.getString("title"),
        streamUrl = item.optionalString("streamUrl"),
        artworkUrl = item.optionalString("artworkUrl"),
        status = LibraryStatus.valueOf(item.getString("status")),
        positionMillis = item.getLong("positionMillis"),
        durationMillis = item.getLong("durationMillis"),
        parentId = item.optionalString("parentId"),
        parentTitle = item.optionalString("parentTitle"),
        updatedAt = item.getLong("updatedAt")
    )

    private fun BackupPreferences.toJson() = JSONObject()
        .put("theme", theme)
        .put("catalogColumns", catalogColumns)
        .put("autoRefresh", autoRefresh)
        .put("catalogRefreshInterval", catalogRefreshInterval)
        .put("epgRefreshInterval", epgRefreshInterval)
        .put("openSubtitlesApiKey", openSubtitlesApiKey)

    private fun preferencesFromJson(item: JSONObject) = BackupPreferences(
        theme = item.getString("theme"),
        catalogColumns = item.getInt("catalogColumns"),
        autoRefresh = item.getBoolean("autoRefresh"),
        catalogRefreshInterval = item.getString("catalogRefreshInterval"),
        epgRefreshInterval = item.getString("epgRefreshInterval"),
        openSubtitlesApiKey = item.getString("openSubtitlesApiKey")
    )

    private fun JSONObject.putNullable(key: String, value: Any?): JSONObject =
        put(key, value ?: JSONObject.NULL)

    private fun JSONObject.optionalString(key: String): String? =
        if (isNull(key)) null else getString(key)

    private fun JSONObject.optionalLong(key: String): Long? =
        if (isNull(key)) null else getLong(key)
}
