package com.tivihub.ui

import android.view.ViewGroup
import android.net.Uri
import java.io.File
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackGroup
import androidx.media3.common.Tracks
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.DefaultMediaItemConverter
import androidx.media3.cast.MediaItemConverter
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaQueueItem
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.tivihub.data.model.EpgProgram
import com.tivihub.data.network.OpenSubtitleFile
import com.tivihub.data.network.OpenSubtitlesApi
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class SubtitleTrackOption(
    val group: TrackGroup,
    val trackIndex: Int,
    val key: String,
    val label: String
)

@UnstableApi
private class TiviHubCastMediaItemConverter(private val isLive: Boolean) : MediaItemConverter {
    private val delegate = DefaultMediaItemConverter()

    override fun toMediaItem(mediaQueueItem: MediaQueueItem): MediaItem =
        delegate.toMediaItem(mediaQueueItem)

    override fun toMediaQueueItem(mediaItem: MediaItem): MediaQueueItem {
        val source = checkNotNull(delegate.toMediaQueueItem(mediaItem).media)
        val mediaInfo = MediaInfo.Builder(source.contentId)
            .setContentUrl(source.contentUrl ?: source.contentId)
            .setContentType(source.contentType)
            .setStreamType(if (isLive) MediaInfo.STREAM_TYPE_LIVE else MediaInfo.STREAM_TYPE_BUFFERED)
            .setMetadata(source.metadata)
            .setCustomData(source.customData)
            .build()
        return MediaQueueItem.Builder(mediaInfo).build()
    }
}

private fun castMimeType(url: String, isLive: Boolean): String {
    val path = Uri.parse(url).path.orEmpty().lowercase()
    return when {
        path.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
        path.endsWith(".mpd") -> MimeTypes.APPLICATION_MPD
        path.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
        path.endsWith(".mp4") || path.endsWith(".m4v") -> MimeTypes.VIDEO_MP4
        isLive -> MimeTypes.VIDEO_MP2T
        else -> MimeTypes.VIDEO_MP4
    }
}

@Composable
@OptIn(markerClass = [UnstableApi::class])
fun PlayerScreen(
    url: String,
    title: String,
    drmLicenseUrl: String?,
    libraryItem: com.tivihub.data.model.LibraryItem?,
    resumePositionMillis: Long,
    guidePrograms: List<EpgProgram>,
    openSubtitlesApiKey: () -> String?,
    subtitleSearchQuery: String?,
    isLive: Boolean,
    onProgress: (Long, Long, Boolean, com.tivihub.data.model.LibraryItem?) -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    var showGuide by rememberSaveable { mutableStateOf(false) }
    var showSubtitleMenu by rememberSaveable { mutableStateOf(false) }
    var showOpenSubtitlesSearch by rememberSaveable { mutableStateOf(false) }
    var subtitleTracks by remember { mutableStateOf(emptyList<SubtitleTrackOption>()) }
    var selectedSubtitleKey by remember { mutableStateOf<String?>(null) }
    var subtitleSearchQuery by rememberSaveable(title, subtitleSearchQuery) {
        mutableStateOf(subtitleSearchQuery ?: title)
    }
    var subtitleSearchResults by remember { mutableStateOf(emptyList<OpenSubtitleFile>()) }
    var subtitleSearchError by remember { mutableStateOf<String?>(null) }
    var subtitleSearchLoading by remember { mutableStateOf(false) }
    val externalSubtitleFiles = remember { mutableListOf<File>() }
    val coroutineScope = rememberCoroutineScope()
    val openSubtitlesApi = remember { OpenSubtitlesApi() }
    val castMediaItem = remember(url, title, drmLicenseUrl, isLive) {
        val itemBuilder = MediaItem.Builder()
            .setUri(url)
            .setMimeType(castMimeType(url, isLive))
            .setMediaMetadata(
                androidx.media3.common.MediaMetadata.Builder().setTitle(title).build()
            )
        if (!drmLicenseUrl.isNullOrBlank()) {
            itemBuilder.setDrmConfiguration(
                MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
                    .setLicenseUri(drmLicenseUrl)
                    .build()
            )
        }
        itemBuilder.build()
    }
    val player = remember(url, title, drmLicenseUrl, isLive) {
        ExoPlayer.Builder(context).build().apply {
            val itemBuilder = MediaItem.Builder().setUri(url)
            if (!drmLicenseUrl.isNullOrBlank()) {
                itemBuilder.setDrmConfiguration(
                    MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
                        .setLicenseUri(drmLicenseUrl)
                        .build()
                )
            }
            setMediaItem(itemBuilder.build())
            if (resumePositionMillis > 0L) seekTo(resumePositionMillis)
            prepare()
            playWhenReady = true
        }
    }
    val castPlayer = remember(context, url, title, drmLicenseUrl, isLive) {
        CastPlayer(
            CastContext.getSharedInstance(context),
            TiviHubCastMediaItemConverter(isLive)
        )
    }
    var activePlayer by remember(player) { mutableStateOf<Player>(player) }
    val currentPlaybackPlayer by rememberUpdatedState(activePlayer)
    DisposableEffect(player, castPlayer) {
        val sessionAvailabilityListener = object : SessionAvailabilityListener {
            override fun onCastSessionAvailable() {
                val position = player.currentPosition
                player.pause()
                castPlayer.setMediaItem(castMediaItem)
                castPlayer.prepare()
                castPlayer.seekTo(position)
                castPlayer.play()
                activePlayer = castPlayer
            }

            override fun onCastSessionUnavailable() {
                player.seekTo(castPlayer.currentPosition)
                player.play()
                activePlayer = player
            }
        }
        castPlayer.setSessionAvailabilityListener(sessionAvailabilityListener)
        if (castPlayer.isCastSessionAvailable) {
            sessionAvailabilityListener.onCastSessionAvailable()
        }
        onDispose {
            onProgress(
                currentPlaybackPlayer.currentPosition,
                currentPlaybackPlayer.duration,
                currentPlaybackPlayer.playbackState == Player.STATE_ENDED,
                libraryItem
            )
            castPlayer.setSessionAvailabilityListener(null)
            castPlayer.release()
            player.release()
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                val options = mutableListOf<SubtitleTrackOption>()
                tracks.groups.forEachIndexed { groupIndex, group ->
                    if (group.type == C.TRACK_TYPE_TEXT) {
                        for (index in 0 until group.length) {
                            if (group.isTrackSupported(index)) {
                                val format = group.getTrackFormat(index)
                                val key = "$groupIndex:$index"
                                options += SubtitleTrackOption(
                                    group.mediaTrackGroup,
                                    index,
                                    key,
                                    format.subtitleLabel(index)
                                )
                                if (group.isTrackSelected(index)) selectedSubtitleKey = key
                            }
                        }
                    }
                }
                subtitleTracks = options
                if (options.none { it.key == selectedSubtitleKey }) selectedSubtitleKey = null
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    DisposableEffect(player, externalSubtitleFiles) {
        onDispose { externalSubtitleFiles.forEach(File::delete) }
    }
    LaunchedEffect(activePlayer) {
        while (true) {
            delay(5_000)
            val ended = activePlayer.playbackState == Player.STATE_ENDED
            onProgress(activePlayer.currentPosition, activePlayer.duration, ended, libraryItem)
            if (ended) break
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    this.player = activePlayer
                    useController = true
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = { it.player = activePlayer }
        )
        Text(
            title,
            Modifier.align(Alignment.TopStart).fillMaxWidth().padding(start = 60.dp, top = 20.dp, end = 64.dp),
            color = Color.White,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1
        )
        IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopStart).padding(8.dp)) {
            Icon(Icons.Default.Close, contentDescription = "Close player", tint = Color.White)
        }
        Row(
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AndroidView(
                factory = { viewContext ->
                    val themed = android.view.ContextThemeWrapper(viewContext, androidx.appcompat.R.style.Theme_AppCompat)
                    MediaRouteButton(themed).also {
                        CastButtonFactory.setUpMediaRouteButton(viewContext, it)
                    }
                },
                modifier = Modifier.size(48.dp)
            )
            IconButton(
                onClick = { showSubtitleMenu = true }
            ) {
                Icon(Icons.Default.ClosedCaption, contentDescription = "Subtitles", tint = Color.White)
            }
            if (guidePrograms.isNotEmpty()) {
                IconButton(onClick = { showGuide = !showGuide }) {
                    Icon(Icons.Default.MenuBook, contentDescription = "Toggle TV guide", tint = Color.White)
                }
            }
        }
        if (showGuide && guidePrograms.isNotEmpty()) {
            LazyColumn(
                Modifier.align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .heightIn(max = 250.dp)
                    .background(Color(0xDD101114))
                    .padding(12.dp)
            ) {
                items(guidePrograms, key = EpgProgram::id) { program ->
                    Column(Modifier.padding(vertical = 6.dp)) {
                        Text(
                            "${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(program.startMillis))}  ${program.title}",
                            color = Color.White,
                            style = MaterialTheme.typography.titleSmall
                        )
                        program.synopsis?.let {
                            Text(it, color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
        if (showSubtitleMenu) {
            AlertDialog(
                onDismissRequest = { showSubtitleMenu = false },
                title = { Text("Subtitles") },
                text = {
                    Column {
                        SubtitleChoice(
                            label = "Off",
                            selected = selectedSubtitleKey == null,
                            onClick = {
                                player.trackSelectionParameters = player.trackSelectionParameters
                                    .buildUpon()
                                    .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                    .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                                    .build()
                                selectedSubtitleKey = null
                                showSubtitleMenu = false
                            }
                        )
                        TextButton(
                            onClick = {
                                showSubtitleMenu = false
                                showOpenSubtitlesSearch = true
                                subtitleSearchError = null
                            }
                        ) { Text("Search OpenSubtitles") }
                        subtitleTracks.forEach { option ->
                            SubtitleChoice(
                                label = option.label,
                                selected = selectedSubtitleKey == option.key,
                                onClick = {
                                    player.trackSelectionParameters = player.trackSelectionParameters
                                        .buildUpon()
                                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                        .setOverrideForType(
                                            androidx.media3.common.TrackSelectionOverride(
                                                option.group,
                                                option.trackIndex
                                            )
                                        )
                                        .build()
                                    selectedSubtitleKey = option.key
                                    showSubtitleMenu = false
                                }
                            )
                        }
                        if (subtitleTracks.isEmpty()) {
                            Text(
                                "No embedded subtitle tracks are available for this video.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showSubtitleMenu = false }) { Text("Done") }
                }
            )
        }
        if (showOpenSubtitlesSearch) {
            AlertDialog(
                onDismissRequest = { if (!subtitleSearchLoading) showOpenSubtitlesSearch = false },
                title = { Text("OpenSubtitles") },
                text = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = subtitleSearchQuery,
                                onValueChange = { subtitleSearchQuery = it },
                                modifier = Modifier.weight(1f),
                                label = { Text("Movie or episode title") },
                                singleLine = true
                            )
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        subtitleSearchLoading = true
                                        subtitleSearchError = null
                                        try {
                                            val key = openSubtitlesApiKey()
                                                ?: throw IllegalStateException("Add your OpenSubtitles API key in Settings first.")
                                            subtitleSearchResults = openSubtitlesApi.search(key, subtitleSearchQuery)
                                            if (subtitleSearchResults.isEmpty()) {
                                                subtitleSearchError = "No supported subtitles found. Try another title."
                                            }
                                        } catch (error: Exception) {
                                            subtitleSearchError = error.message ?: "OpenSubtitles search failed."
                                        } finally {
                                            subtitleSearchLoading = false
                                        }
                                    }
                                },
                                enabled = !subtitleSearchLoading && subtitleSearchQuery.isNotBlank()
                            ) {
                                Text("Search")
                            }
                        }
                        if (subtitleSearchLoading) {
                            CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                        }
                        subtitleSearchError?.let {
                            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        LazyColumn(Modifier.heightIn(max = 280.dp)) {
                            items(subtitleSearchResults.take(40), key = { it.fileId }) { option ->
                                TextButton(
                                    onClick = {
                                        coroutineScope.launch {
                                            subtitleSearchLoading = true
                                            subtitleSearchError = null
                                            var downloadedFile: File? = null
                                            try {
                                                val key = openSubtitlesApiKey()
                                                    ?: throw IllegalStateException("Add your OpenSubtitles API key in Settings first.")
                                                val download = openSubtitlesApi.download(key, option)
                                                val subtitleFile = withContext(Dispatchers.IO) {
                                                    val directory = File(context.cacheDir, "subtitles")
                                                    if (!directory.exists() && !directory.mkdirs()) {
                                                        throw IllegalStateException("Could not prepare subtitle storage.")
                                                    }
                                                    File.createTempFile("opensubtitles-", ".${option.extension}", directory)
                                                        .apply { writeBytes(download.content) }
                                                }
                                                downloadedFile = subtitleFile
                                                val currentItem = player.currentMediaItem
                                                    ?: throw IllegalStateException("The current video is no longer available.")
                                                val previousSubtitles = externalSubtitleFiles.map(Uri::fromFile).toSet()
                                                val subtitleConfiguration = MediaItem.SubtitleConfiguration.Builder(
                                                    Uri.fromFile(subtitleFile)
                                                )
                                                    .setMimeType(
                                                        if (option.extension == "vtt") MimeTypes.TEXT_VTT
                                                        else MimeTypes.APPLICATION_SUBRIP
                                                    )
                                                    .setLanguage(option.language.takeUnless { it == "und" })
                                                    .setSelectionFlags(androidx.media3.common.C.SELECTION_FLAG_DEFAULT)
                                                    .build()
                                                val mediaItem = currentItem.buildUpon()
                                                    .setSubtitleConfigurations(
                                                        currentItem.localConfiguration?.subtitleConfigurations.orEmpty()
                                                            .filterNot { it.uri in previousSubtitles } +
                                                            subtitleConfiguration
                                                    )
                                                    .build()
                                                val position = player.currentPosition
                                                val shouldPlay = player.playWhenReady
                                                player.trackSelectionParameters = player.trackSelectionParameters
                                                    .buildUpon()
                                                    .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, false)
                                                    .clearOverridesOfType(androidx.media3.common.C.TRACK_TYPE_TEXT)
                                                    .build()
                                                player.setMediaItem(mediaItem, position)
                                                player.prepare()
                                                player.playWhenReady = shouldPlay
                                                externalSubtitleFiles += subtitleFile
                                                downloadedFile = null
                                                showOpenSubtitlesSearch = false
                                            } catch (error: Exception) {
                                                downloadedFile?.delete()
                                                subtitleSearchError = error.message ?: "Could not load this subtitle."
                                            } finally {
                                                subtitleSearchLoading = false
                                            }
                                        }
                                    },
                                    enabled = !subtitleSearchLoading,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(option.displayName, modifier = Modifier.fillMaxWidth())
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = { showOpenSubtitlesSearch = false },
                        enabled = !subtitleSearchLoading
                    ) { Text("Done") }
                }
            )
        }
    }
}

@Composable
private fun SubtitleChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = onClick)
        TextButton(onClick = onClick) { Text(label) }
    }
}

private fun Format.subtitleLabel(index: Int): String =
    label?.takeIf(String::isNotBlank)
        ?: language?.takeIf { it.isNotBlank() && it != "und" }?.uppercase()
        ?: "Subtitle ${index + 1}"
