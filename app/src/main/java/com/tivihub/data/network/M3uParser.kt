package com.tivihub.data.network

import com.tivihub.data.model.LiveChannel
import com.tivihub.data.model.Playlist
import java.net.URI

class M3uParser {
    fun parse(content: String, playlist: Playlist): List<LiveChannel> {
        val lines = content.lineSequence().map(String::trim).filter(String::isNotEmpty)
        val result = mutableListOf<LiveChannel>()
        var pending: Metadata? = null

        for (line in lines) {
            when {
                line.startsWith("#EXTINF", ignoreCase = true) ->
                    pending = parseMetadata(line, playlist.drmLicenseUrl)
                line.startsWith("#EXT-X-KEY", ignoreCase = true) ||
                    line.startsWith("#EXT-X-SESSION-KEY", ignoreCase = true) -> {
                    val current = pending ?: Metadata(name = "", group = "General")
                    pending = current.copy(drmLicenseUrl = current.drmLicenseUrl ?: attributes(line)["URI"])
                }
                line.startsWith("#") -> Unit
                pending != null -> {
                    val metadata = pending
                    val streamUrl = resolve(line, playlist.url)
                    result += LiveChannel(
                        playlistId = playlist.id,
                        name = metadata.name.ifBlank { metadata.attributes["tvg-name"] ?: streamUrl },
                        group = metadata.group,
                        streamUrl = streamUrl,
                        logoUrl = metadata.attributes["tvg-logo"] ?: metadata.attributes["logo"],
                        tvgId = metadata.attributes["tvg-id"],
                        drmLicenseUrl = metadata.drmLicenseUrl
                    )
                    pending = null
                }
            }
        }
        return result
    }

    private fun parseMetadata(line: String, playlistDrm: String): Metadata {
        val body = line.substringAfter("#EXTINF:", "")
        val separator = findTitleSeparator(body)
        val attributeText = if (separator >= 0) body.substring(0, separator) else body
        val title = if (separator >= 0) body.substring(separator + 1).trim() else ""
        val attrs = attributes(attributeText)
        return Metadata(
            name = title,
            group = attrs["group-title"]?.ifBlank { null } ?: "General",
            attributes = attrs,
            drmLicenseUrl = attrs["drm-url"] ?: attrs["license-url"] ?: playlistDrm
        )
    }

    private fun findTitleSeparator(value: String): Int {
        var quote: Char? = null
        value.forEachIndexed { index, character ->
            if (quote == character) quote = null
            else if (quote == null && (character == '"' || character == '\'')) quote = character
            else if (quote == null && character == ',') return index
        }
        return -1
    }

    private fun attributes(text: String): Map<String, String> {
        val pattern = Regex("""([A-Za-z0-9_-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s,]+)""")
        return pattern.findAll(text).associate { match ->
            match.groupValues[1] to match.groupValues[2].trim('"', '\'')
        }
    }

    private fun resolve(stream: String, playlistUrl: String): String {
        val uri = URI(stream)
        if (uri.isAbsolute) return uri.toString()
        return URI(playlistUrl).resolve(uri).toString()
    }

    private data class Metadata(
        val name: String,
        val group: String,
        val attributes: Map<String, String> = emptyMap(),
        val drmLicenseUrl: String? = null
    )
}
