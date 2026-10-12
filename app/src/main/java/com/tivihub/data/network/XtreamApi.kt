package com.tivihub.data.network

import com.tivihub.data.model.EpgProgram
import com.tivihub.data.model.Episode
import com.tivihub.data.model.LiveChannel
import com.tivihub.data.model.Movie
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import com.tivihub.data.model.Series
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class XtreamApi(
    private val http: OkHttpClient = OkHttpClient(),
    private val m3uParser: M3uParser = M3uParser(),
    private val xmltvParser: XmltvParser = XmltvParser()
) {
    suspend fun authenticate(playlist: Playlist): Long? = withContext(Dispatchers.IO) {
        require(playlist.username.isNotBlank() && playlist.password.isNotBlank()) {
            "Enter the Xtream username and password."
        }
        val payload = requestJson(apiUrl(playlist), "Xtream account information")
        val userInfo = payload.optJSONObject("user_info")
            ?: throw IllegalStateException("Xtream returned an unexpected authentication response.")
        val status = userInfo.optString("status", payload.optString("status", ""))
        val auth = userInfo.optInt("auth", 1)
        require(auth != 0 && status.lowercase() !in setOf("disabled", "expired", "unauthorized")) {
            payload.optString("message").ifBlank { "Xtream authentication was rejected: $status" }
        }
        parseXtreamExpiryMillis(userInfo.optString("exp_date").takeIf(String::isNotBlank))
    }

    internal fun parseXtreamExpiryMillis(value: String?): Long? {
        val expiry = value?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        val numericValue = expiry.toLongOrNull()
        if (numericValue != null) {
            if (numericValue <= 0L) return null
            return if (numericValue < 100_000_000_000L) {
                if (numericValue > Long.MAX_VALUE / 1_000L) null else numericValue * 1_000L
            } else {
                numericValue
            }
        }

        return try {
            Instant.parse(expiry).toEpochMilli()
        } catch (_: DateTimeParseException) {
            try {
                OffsetDateTime.parse(expiry).toInstant().toEpochMilli()
            } catch (_: DateTimeParseException) {
                try {
                    LocalDate.parse(expiry).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
                } catch (_: DateTimeParseException) {
                    null
                }
            }
        }
    }

    suspend fun liveChannels(playlist: Playlist): List<LiveChannel> = withContext(Dispatchers.IO) {
        if (playlist.type == PlaylistType.M3U) {
            val body = requestText(playlist.url, "M3U playlist")
            return@withContext m3uParser.parse(body, playlist)
        }
        authenticate(playlist)
        val categories = requestArray(
            apiUrl(playlist, action = "get_live_categories"),
            alternateKey = "categories",
            requestDescription = "Xtream live categories",
            mapItem = { it }
        )
            .associate { it.optString("category_id") to it.optString("category_name") }
        requestArray(
            apiUrl(playlist, action = "get_live_streams"),
            requestDescription = "Xtream live channels",
            mapItem = { item ->
            val id = item.valueString("stream_id") ?: return@requestArray null
            val name = item.optString("name").takeIf(String::isNotBlank) ?: return@requestArray null
            val categoryId = item.valueString("category_id").orEmpty()
            LiveChannel(
                id = "$id:${playlist.id}",
                playlistId = playlist.id,
                name = name,
                group = categories[categoryId] ?: "General",
                streamUrl = streamUrl(playlist, "live", id, "m3u8"),
                logoUrl = item.optString("stream_icon").takeIf(String::isNotBlank),
                tvgId = item.optString("epg_channel_id").takeIf(String::isNotBlank),
                drmLicenseUrl = playlist.drmLicenseUrl.ifBlank { null }
            )
        })
    }

    suspend fun movies(playlist: Playlist): List<Movie> = withContext(Dispatchers.IO) {
        authenticate(playlist)
        val categories = requestArray(
            apiUrl(playlist, action = "get_vod_categories"),
            alternateKey = "categories",
            requestDescription = "Xtream movie categories",
            mapItem = { it }
        )
            .associate { it.optString("category_id") to it.optString("category_name") }
        requestArray(
            apiUrl(playlist, action = "get_vod_streams"),
            requestDescription = "Xtream movies",
            mapItem = { item ->
            val id = item.valueString("stream_id") ?: return@requestArray null
            val name = item.optString("name").takeIf(String::isNotBlank) ?: return@requestArray null
            val ext = item.optString("container_extension", "mp4").ifBlank { "mp4" }
            val categoryId = item.valueString("category_id")
            Movie(
                id = id,
                name = name,
                streamUrl = streamUrl(playlist, "movie", id, ext),
                posterUrl = item.optString("stream_icon").takeIf(String::isNotBlank),
                overview = item.optString("plot").takeIf(String::isNotBlank),
                year = item.optString("releasedate").take(4).toIntOrNull()
                    ?: item.optString("year").toIntOrNull(),
                rating = item.optString("rating").toDoubleOrNull()
                    ?: item.optString("rating_5based").toDoubleOrNull(),
                categoryId = categoryId,
                category = categoryId?.let { categories[it] ?: "Uncategorized" },
                addedAtMillis = item.epochMillis("added")
            )
        })
    }

    suspend fun movieDetails(playlist: Playlist, movie: Movie): Movie = withContext(Dispatchers.IO) {
        authenticate(playlist)
        val response = requestJson(
            apiUrl(playlist, action = "get_vod_info", extra = mapOf("vod_id" to movie.id)),
            "Xtream movie details"
        )
        val info = response.optJSONObject("info") ?: response
        val movieData = response.optJSONObject("movie_data")
        movie.copy(
            overview = info.optString("plot").takeIf(String::isNotBlank) ?: movie.overview,
            posterUrl = info.optString("movie_image").takeIf(String::isNotBlank) ?: movie.posterUrl,
            year = (info.optString("releasedate").take(4).toIntOrNull()
                ?: info.optString("year").toIntOrNull()
                ?: movie.year),
            rating = info.optString("rating").toDoubleOrNull() ?: movie.rating,
            streamUrl = movieData?.let { data ->
                val extension = data.optString("container_extension").ifBlank { null }
                if (extension == null) movie.streamUrl else {
                    streamUrl(playlist, "movie", movie.id, extension)
                }
            } ?: movie.streamUrl
        )
    }

    suspend fun series(playlist: Playlist): List<Series> = withContext(Dispatchers.IO) {
        authenticate(playlist)
        val categories = requestArray(
            apiUrl(playlist, action = "get_series_categories"),
            alternateKey = "categories",
            requestDescription = "Xtream series categories",
            mapItem = { it }
        )
            .associate { it.optString("category_id") to it.optString("category_name") }
        requestArray(
            apiUrl(playlist, action = "get_series"),
            requestDescription = "Xtream series",
            mapItem = { item ->
            val id = item.valueString("series_id") ?: return@requestArray null
            val name = item.optString("name").takeIf(String::isNotBlank) ?: return@requestArray null
            val categoryId = item.valueString("category_id")
            Series(
                id = id,
                name = name,
                posterUrl = item.optString("cover").takeIf(String::isNotBlank),
                overview = item.optString("plot").takeIf(String::isNotBlank),
                seasons = item.optJSONArray("seasons")?.length() ?: 0,
                categoryId = categoryId,
                category = categoryId?.let { categories[it] ?: "Uncategorized" },
                year = item.optString("year").take(4).toIntOrNull(),
                rating = item.optString("rating").toDoubleOrNull()
                    ?: item.optString("rating_5based").toDoubleOrNull(),
                addedAtMillis = item.epochMillis("added") ?: item.epochMillis("last_modified")
            )
        })
    }

    suspend fun episodes(playlist: Playlist, series: Series): List<Episode> = withContext(Dispatchers.IO) {
        authenticate(playlist)
        val json = requestJson(
            apiUrl(playlist, action = "get_series_info", extra = mapOf("series_id" to series.id)),
            "Xtream episode information"
        )
        val seasons = json.optJSONObject("episodes")
            ?: throw IllegalStateException("Xtream returned an unexpected episode response.")
        buildList {
            val keys = seasons.keys()
            while (keys.hasNext()) {
                val season = keys.next().toIntOrNull() ?: 0
                val items = seasons.optJSONArray(season.toString()) ?: continue
                for (index in 0 until items.length()) {
                    val item = items.optJSONObject(index) ?: continue
                    val id = item.valueString("id") ?: continue
                    val name = item.optString("title").ifBlank { item.optString("name") }
                        .takeIf(String::isNotBlank) ?: continue
                    val extension = item.optString("container_extension", "mp4").ifBlank { "mp4" }
                    add(
                        Episode(
                            id = id,
                            seriesId = series.id,
                            season = season,
                            number = item.optInt("episode_num"),
                            name = name,
                            streamUrl = streamUrl(playlist, "series", id, extension),
                            overview = item.optJSONObject("info")?.optString("plot")?.takeIf(String::isNotBlank),
                            posterUrl = item.optJSONObject("info")?.optString("movie_image")?.takeIf(String::isNotBlank)
                        )
                    )
                }
            }
        }.sortedWith(compareBy(Episode::season, Episode::number))
    }

    suspend fun epg(playlist: Playlist, startMillis: Long, endMillis: Long): List<EpgProgram> =
        withContext(Dispatchers.IO) {
        require(playlist.type == PlaylistType.XTREAM) {
            "This playlist type does not provide an Xtream EPG feed."
        }
        val request = Request.Builder().url(xmltvUrl(playlist)).header("Accept", "*/*").build()
        val programs = http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Playlist EPG request failed with HTTP ${response.code}.")
            }
            val body = response.body
                ?: throw IllegalStateException("Playlist EPG server returned an empty response.")
            xmltvParser.parse(body.byteStream(), playlist.name, startMillis, endMillis)
        }
        require(programs.isNotEmpty()) {
            "Playlist EPG contained no programmes in the current guide window."
        }
        programs
    }

    internal fun xmltvUrl(playlist: Playlist): String {
        require(playlist.type == PlaylistType.XTREAM) {
            "This playlist type does not provide an Xtream EPG feed."
        }
        val base = URI(playlist.url)
        require(base.scheme in setOf("http", "https") && base.rawAuthority != null) {
            "Enter a valid HTTP or HTTPS playlist URL."
        }
        val basePath = base.path.orEmpty().let { path ->
            when {
                path.endsWith("/player_api.php") -> path.removeSuffix("/player_api.php")
                path == "/player_api.php" -> ""
                else -> path.trimEnd('/')
            }
        }
        val path = "$basePath/xmltv.php".let { if (it.startsWith('/')) it else "/$it" }
        val query = linkedMapOf(
            "username" to playlist.username,
            "password" to playlist.password
        ).entries.joinToString("&") { (key, value) ->
            "${queryEncode(key)}=${queryEncode(value)}"
        }
        return "${base.scheme}://${base.rawAuthority}$path?$query"
    }

    private fun requestJson(url: String, description: String): JSONObject =
        JSONObject(requestText(url, description))

    private fun requestText(url: String, description: String): String {
        val request = Request.Builder().url(url).header("Accept", "*/*").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("$description request failed with HTTP ${response.code}.")
            }
            return response.body?.string()
                ?: throw IllegalStateException("$description server returned an empty response.")
        }
    }

    private fun <T> requestArray(
        url: String,
        alternateKey: String? = null,
        requestDescription: String,
        mapItem: (JSONObject) -> T?
    ): List<T> {
        val request = Request.Builder().url(url).header("Accept", "*/*").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("$requestDescription request failed with HTTP ${response.code}.")
            }
            val body = response.body
                ?: throw IllegalStateException("$requestDescription server returned an empty response.")
            return body.charStream().buffered().use { reader ->
                JsonArrayReader.read(reader, requestDescription, alternateKey, mapItem)
            }
        }
    }

    internal fun apiUrl(
        playlist: Playlist,
        action: String? = null,
        extra: Map<String, String> = emptyMap()
    ): String {
        val base = URI(playlist.url)
        require(base.scheme in setOf("http", "https") && base.rawAuthority != null) {
            "Enter a valid HTTP or HTTPS playlist URL."
        }
        val basePath = base.path.orEmpty().trimEnd('/')
        val apiPath = if (basePath.endsWith("player_api.php")) basePath else "$basePath/player_api.php"
        val path = if (apiPath.startsWith('/')) apiPath else "/$apiPath"
        val params = linkedMapOf(
            "username" to playlist.username,
            "password" to playlist.password
        )
        if (action != null) params["action"] = action
        params.putAll(extra)
        val query = params.entries.joinToString("&") { (key, value) ->
            "${queryEncode(key)}=${queryEncode(value)}"
        }
        return "${base.scheme}://${base.rawAuthority}${path.ifBlank { "/player_api.php" }}?$query"
    }

    internal fun streamUrl(playlist: Playlist, type: String, id: String, extension: String): String {
        val base = URI(playlist.url)
        require(base.scheme in setOf("http", "https") && base.rawAuthority != null) {
            "Enter a valid HTTP or HTTPS playlist URL."
        }
        val basePath = base.path.orEmpty().trimEnd('/')
        val prefix = when {
            basePath == "player_api.php" -> ""
            basePath.endsWith("/player_api.php") -> basePath.removeSuffix("/player_api.php")
            else -> basePath
        }
        val path = "$prefix/$type/${pathEncode(playlist.username)}/${pathEncode(playlist.password)}/${pathEncode(id)}.${pathEncode(extension)}"
        return "${base.scheme}://${base.rawAuthority}$path"
    }

    private fun queryEncode(value: String) =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    private fun pathEncode(value: String) =
        queryEncode(value).replace("+", "%20")

    private fun JSONObject.valueString(key: String): String? {
        val value = opt(key)
        return when (value) {
            is String -> value.takeIf(String::isNotBlank)
            is Number -> value.toString()
            else -> null
        }
    }

    private fun JSONObject.epochMillis(key: String): Long? =
        valueString(key)?.toLongOrNull()?.let { value ->
            if (value in 1_000_000_000L until 100_000_000_000L) value * 1_000L else value
        }
}
