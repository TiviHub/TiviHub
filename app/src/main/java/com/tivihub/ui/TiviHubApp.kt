package com.tivihub.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn as AndroidOptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import android.net.Uri
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.core.content.edit
import com.tivihub.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.util.UnstableApi
import coil.compose.AsyncImage
import com.tivihub.MainViewModel
import com.tivihub.PlaylistRefreshState
import com.tivihub.AppSection
import com.tivihub.CatalogRefreshInterval
import com.tivihub.data.model.ContentType
import com.tivihub.data.model.Favorite
import com.tivihub.data.model.LibraryItem
import com.tivihub.data.model.LibraryStatus
import com.tivihub.data.model.LiveChannel
import com.tivihub.data.model.Movie
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import com.tivihub.data.model.Series
import com.tivihub.data.local.BackupSummary
import com.tivihub.data.local.TiviHubBackupFile
import com.tivihub.data.local.BackupDisplaySettings
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.text.DateFormat
import java.util.Date
import java.util.TimeZone
import java.util.UUID
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@AndroidOptIn(markerClass = [UnstableApi::class])
@Composable
fun TiviHubApp(viewModel: MainViewModel) {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("tivihub.settings", 0) }
    var theme by rememberSaveable {
        mutableStateOf(preferences.getString("theme", "system") ?: "system")
    }
    var catalogColumns by rememberSaveable {
        mutableStateOf(preferences.getInt("catalog.columns", 0).takeIf { it in setOf(0, 2, 3, 4) } ?: 0)
    }
    var liveSearchQuery by rememberSaveable { mutableStateOf("") }
    var moviesSearchQuery by rememberSaveable { mutableStateOf("") }
    var seriesSearchQuery by rememberSaveable { mutableStateOf("") }
    val darkTheme = when (theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    TiviHubTheme(darkTheme) {
        val section by viewModel.section.collectAsStateWithLifecycle()
        val playlists by viewModel.playlists.collectAsStateWithLifecycle()
        val activePlaylist by viewModel.activePlaylist.collectAsStateWithLifecycle()
        val catalogRefreshTimes by viewModel.catalogRefreshTimes.collectAsStateWithLifecycle()
        val catalogRefreshInProgress by viewModel.catalogRefreshInProgress.collectAsStateWithLifecycle()
        val playlistRefreshStates by viewModel.playlistRefreshStates.collectAsStateWithLifecycle()
        val epgLastFetched by viewModel.epgLastFetched.collectAsStateWithLifecycle()
        val epgRefreshInProgress by viewModel.epgRefreshInProgress.collectAsStateWithLifecycle()
        val openSubtitlesConfigured by viewModel.openSubtitlesConfigured.collectAsStateWithLifecycle()
        val channels by viewModel.channels.collectAsStateWithLifecycle()
        val movies by viewModel.movies.collectAsStateWithLifecycle()
        val series by viewModel.series.collectAsStateWithLifecycle()
        val episodes by viewModel.episodes.collectAsStateWithLifecycle()
        val selectedSeries by viewModel.selectedSeries.collectAsStateWithLifecycle()
        val selectedMovie by viewModel.selectedMovie.collectAsStateWithLifecycle()
        val selectedChannel by viewModel.selectedChannel.collectAsStateWithLifecycle()
        val favorites by viewModel.favorites.collectAsStateWithLifecycle()
        val libraryItems by viewModel.libraryItems.collectAsStateWithLifecycle()
        val loading by viewModel.loading.collectAsStateWithLifecycle()
        val playerItem by viewModel.playerItem.collectAsStateWithLifecycle()
        val guidePrograms by viewModel.guidePrograms.collectAsStateWithLifecycle()
        val liveGuidePrograms by viewModel.liveGuidePrograms.collectAsStateWithLifecycle()
        val channelGuidePrograms by viewModel.channelGuidePrograms.collectAsStateWithLifecycle()
        val snackbar = remember { SnackbarHostState() }
        var playlistMenuExpanded by rememberSaveable { mutableStateOf(false) }
        LaunchedEffect(viewModel, snackbar) {
            viewModel.feedback.collectLatest { message ->
                snackbar.showSnackbar(
                    message = message,
                    actionLabel = "Close",
                    duration = SnackbarDuration.Indefinite
                )
            }
        }
        BackHandler(enabled = selectedSeries != null || selectedMovie != null || selectedChannel != null || playerItem != null) {
            if (playerItem != null) viewModel.closePlayer()
            else if (selectedMovie != null) viewModel.closeMovie()
            else if (selectedChannel != null) viewModel.closeChannel()
            else viewModel.closeSeries()
        }

        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                Column {
                    TopAppBar(
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.background
                        ),
                        title = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(
                                    painter = painterResource(R.drawable.tivihub_icon),
                                    contentDescription = null,
                                    modifier = Modifier.size(38.dp)
                                )
                                Text(
                                    "TiviHub",
                                    modifier = Modifier.padding(start = 12.dp),
                                    fontWeight = FontWeight.SemiBold,
                                    letterSpacing = (-0.4).sp
                                )
                            }
                        },
                        actions = {
                            Box {
                                TextButton(
                                    onClick = { playlistMenuExpanded = true },
                                    enabled = playlists.isNotEmpty()
                                ) {
                                    Text(
                                        activePlaylist?.name ?: "Select playlist",
                                        style = MaterialTheme.typography.labelSmall,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Icon(
                                        Icons.Default.KeyboardArrowDown,
                                        contentDescription = "Switch playlist",
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                DropdownMenu(
                                    expanded = playlistMenuExpanded,
                                    onDismissRequest = { playlistMenuExpanded = false }
                                ) {
                                    playlists.forEach { playlist ->
                                        DropdownMenuItem(
                                            text = {
                                                Column {
                                                    Text(playlist.name)
                                                    Text(
                                                        playlist.type.name,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                            },
                                            onClick = {
                                                playlistMenuExpanded = false
                                                if (playlist.id != activePlaylist?.id) {
                                                    viewModel.activatePlaylist(playlist)
                                                }
                                            },
                                            leadingIcon = if (playlist.id == activePlaylist?.id) {
                                                { Icon(Icons.Default.Check, contentDescription = "Active playlist") }
                                            } else null
                                        )
                                    }
                                    DropdownMenuItem(
                                        text = { Text("Manage playlists") },
                                        onClick = {
                                            playlistMenuExpanded = false
                                            viewModel.selectSection(AppSection.SETTINGS)
                                        },
                                        leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null) }
                                    )
                                }
                            }
                        }
                    )
                }
            },
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                if (selectedSeries == null && selectedMovie == null && selectedChannel == null) {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        tonalElevation = 0.dp,
                        modifier = Modifier.border(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
                        )
                    ) {
                        AppSection.entries.forEach { item ->
                            NavigationBarItem(
                                selected = section == item,
                                onClick = { viewModel.selectSection(item) },
                                icon = {
                                    Icon(
                                        when (item) {
                                            AppSection.LIVE -> Icons.Default.LiveTv
                                            AppSection.MOVIES -> Icons.Default.Movie
                                            AppSection.SERIES -> Icons.Default.Tv
                                            AppSection.LIBRARY -> Icons.Default.Bookmark
                                            AppSection.SETTINGS -> Icons.Default.Settings
                                        },
                                        contentDescription = item.label
                                    )
                                },
                                label = { Text(item.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                    selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                if (selectedChannel != null) {
                    selectedChannel?.let { channel ->
                        LiveChannelDetailsScreen(
                            channel = channel,
                            programs = channelGuidePrograms,
                            favorite = favorites.any {
                                it.contentType == ContentType.LIVE &&
                                    it.contentId == channel.id &&
                                    it.playlistId == channel.playlistId
                            },
                            onBack = viewModel::closeChannel,
                            onPlay = {
                                viewModel.play(
                                    channel.streamUrl,
                                    channel.name,
                                    channel.drmLicenseUrl,
                                    channel.tvgId,
                                    isLive = true
                                )
                            },
                            onFavorite = {
                                viewModel.toggleFavorite(
                                    Favorite(
                                        contentId = channel.id,
                                        contentType = ContentType.LIVE,
                                        title = channel.name,
                                        playlistId = channel.playlistId,
                                        streamUrl = channel.streamUrl,
                                        artworkUrl = channel.logoUrl
                                    )
                                )
                            },
                            onRefreshGuide = { viewModel.refreshGuide() }
                        )
                    }
                } else if (selectedMovie != null) {
                    selectedMovie?.let { movie ->
                        MovieDetailsScreen(
                            movie = movie,
                            loading = loading,
                            inLibrary = libraryItems.any {
                                it.contentType == ContentType.MOVIE && it.contentId == movie.id &&
                                    it.playlistId == activePlaylist?.id
                            } || favorites.any {
                                it.contentType == ContentType.MOVIE && it.contentId == movie.id &&
                                    it.playlistId == activePlaylist?.id
                            },
                            onBack = viewModel::closeMovie,
                            onPlay = {
                                activePlaylist?.let { playlist ->
                                    viewModel.play(
                                        movie.streamUrl,
                                        movie.name,
                                        subtitleSearchQuery = movie.year?.let { "${movie.name} $it" } ?: movie.name,
                                        libraryItem = LibraryItem(
                                            contentId = movie.id,
                                            contentType = ContentType.MOVIE,
                                            playlistId = playlist.id,
                                            title = movie.name,
                                            streamUrl = movie.streamUrl,
                                            artworkUrl = movie.posterUrl,
                                            status = LibraryStatus.WATCHING
                                        )
                                    )
                                }
                            },
                            onToggleLibrary = {
                                activePlaylist?.let { playlist ->
                                    viewModel.toggleLibrary(
                                        LibraryItem(
                                            contentId = movie.id,
                                            contentType = ContentType.MOVIE,
                                            playlistId = playlist.id,
                                            title = movie.name,
                                            streamUrl = movie.streamUrl,
                                            artworkUrl = movie.posterUrl,
                                            status = LibraryStatus.WATCHLIST
                                        )
                                    )
                                }
                            }
                        )
                    }
                } else if (selectedSeries != null) {
                    selectedSeries?.let { selected ->
                        EpisodesScreen(
                            series = selected,
                            episodes = episodes,
                            loading = loading,
                            inLibrary = libraryItems.any {
                                it.contentType == ContentType.SERIES && it.contentId == selected.id &&
                                    it.playlistId == activePlaylist?.id
                            } || favorites.any {
                                it.contentType == ContentType.SERIES && it.contentId == selected.id &&
                                    it.playlistId == activePlaylist?.id
                            },
                            onBack = viewModel::closeSeries,
                            onToggleLibrary = {
                                activePlaylist?.let { playlist ->
                                    viewModel.toggleLibrary(
                                        LibraryItem(
                                            contentId = selected.id,
                                            contentType = ContentType.SERIES,
                                            playlistId = playlist.id,
                                            title = selected.name,
                                            streamUrl = null,
                                            artworkUrl = selected.posterUrl,
                                            status = LibraryStatus.WATCHLIST
                                        )
                                    )
                                }
                            },
                            onPlay = { episode ->
                                activePlaylist?.let { playlist ->
                                    viewModel.play(
                                        episode.streamUrl,
                                        episode.name,
                                        subtitleSearchQuery = "${selected.name} S${episode.season}E${episode.number}",
                                        libraryItem = LibraryItem(
                                            contentId = episode.id,
                                            contentType = ContentType.EPISODE,
                                            playlistId = playlist.id,
                                            title = episode.name,
                                            streamUrl = episode.streamUrl,
                                            artworkUrl = episode.posterUrl,
                                            status = LibraryStatus.WATCHING,
                                            parentId = selected.id,
                                            parentTitle = selected.name
                                        )
                                    )
                                }
                            }
                        )
                    }
                } else when {
                    section == AppSection.LIVE -> LiveScreen(
                        channels = channels,
                        favorites = favorites,
                        guidePrograms = liveGuidePrograms,
                        loading = loading,
                        search = liveSearchQuery,
                        onSearchChanged = { liveSearchQuery = it },
                        onSelect = viewModel::openChannel,
                        onPlay = {
                            viewModel.play(
                                it.streamUrl,
                                it.name,
                                it.drmLicenseUrl,
                                it.tvgId,
                                isLive = true
                            )
                        },
                        onFavorite = { channel ->
                            viewModel.toggleFavorite(
                                Favorite(
                                    contentId = channel.id,
                                    contentType = ContentType.LIVE,
                                    title = channel.name,
                                    playlistId = channel.playlistId,
                                    streamUrl = channel.streamUrl,
                                    artworkUrl = channel.logoUrl
                                )
                            )
                        }
                    )
                    section == AppSection.MOVIES -> MoviesScreen(
                        movies = movies,
                        favorites = favorites,
                        libraryItems = libraryItems,
                        playlistId = activePlaylist?.id,
                        loading = loading,
                        enabled = activePlaylist?.type == PlaylistType.XTREAM,
                        search = moviesSearchQuery,
                        onSearchChanged = { moviesSearchQuery = it },
                        columns = catalogColumns,
                        onColumnsChanged = {
                            catalogColumns = it
                            preferences.edit { putInt("catalog.columns", it) }
                            viewModel.notifyAction("Catalog layout updated")
                        },
                        onPlay = viewModel::openMovie,
                        onToggleLibrary = { movie ->
                            activePlaylist?.let { playlist ->
                                viewModel.toggleLibrary(
                                    LibraryItem(
                                        contentId = movie.id,
                                        contentType = ContentType.MOVIE,
                                        playlistId = playlist.id,
                                        title = movie.name,
                                        streamUrl = movie.streamUrl,
                                        artworkUrl = movie.posterUrl,
                                        status = LibraryStatus.WATCHLIST
                                    )
                                )
                            }
                        }
                    )
                    section == AppSection.SERIES -> SeriesScreen(
                        series = series,
                        favorites = favorites,
                        libraryItems = libraryItems,
                        playlistId = activePlaylist?.id,
                        loading = loading,
                        enabled = activePlaylist?.type == PlaylistType.XTREAM,
                        search = seriesSearchQuery,
                        onSearchChanged = { seriesSearchQuery = it },
                        columns = catalogColumns,
                        onColumnsChanged = {
                            catalogColumns = it
                            preferences.edit { putInt("catalog.columns", it) }
                            viewModel.notifyAction("Catalog layout updated")
                        },
                        onSelect = viewModel::openSeries,
                        onToggleLibrary = { item ->
                            activePlaylist?.let { playlist ->
                                viewModel.toggleLibrary(
                                    LibraryItem(
                                        contentId = item.id,
                                        contentType = ContentType.SERIES,
                                        playlistId = playlist.id,
                                        title = item.name,
                                        streamUrl = null,
                                        artworkUrl = item.posterUrl,
                                        status = LibraryStatus.WATCHLIST
                                    )
                                )
                            }
                        }
                    )
                    section == AppSection.LIBRARY -> LibraryScreen(
                        favorites = favorites,
                        libraryItems = libraryItems,
                        onOpenFavorite = { favorite ->
                            if (favorite.contentType == ContentType.LIVE) {
                                val channel = channels.firstOrNull {
                                    it.id == favorite.contentId && it.playlistId == favorite.playlistId
                                } ?: favorite.streamUrl?.let { streamUrl ->
                                    LiveChannel(
                                        id = favorite.contentId,
                                        playlistId = favorite.playlistId,
                                        name = favorite.title,
                                        streamUrl = streamUrl,
                                        logoUrl = favorite.artworkUrl
                                    )
                                }
                                channel?.let(viewModel::openChannel)
                            } else if (favorite.contentType == ContentType.SERIES) {
                                viewModel.openLibraryItem(
                                    LibraryItem(
                                        contentId = favorite.contentId,
                                        contentType = ContentType.SERIES,
                                        playlistId = favorite.playlistId,
                                        title = favorite.title,
                                        streamUrl = null,
                                        artworkUrl = favorite.artworkUrl,
                                        status = LibraryStatus.WATCHLIST
                                    )
                                )
                            } else if (favorite.contentType == ContentType.MOVIE && favorite.streamUrl != null) {
                                viewModel.play(
                                    favorite.streamUrl,
                                    favorite.title,
                                    libraryItem = LibraryItem(
                                        contentId = favorite.contentId,
                                        contentType = ContentType.MOVIE,
                                        playlistId = favorite.playlistId,
                                        title = favorite.title,
                                        streamUrl = favorite.streamUrl,
                                        artworkUrl = favorite.artworkUrl,
                                        status = LibraryStatus.WATCHING
                                    )
                                )
                            } else {
                                favorite.streamUrl?.let { viewModel.play(it, favorite.title) }
                            }
                        },
                        onOpenItem = viewModel::openLibraryItem,
                        onOpenSavedItem = viewModel::openLibraryDetails,
                        onRemoveFavorite = { favorite -> viewModel.toggleFavorite(favorite) },
                        onStatusChanged = viewModel::setLibraryStatus,
                        onRemoveFromWatchlist = viewModel::removeFromWatchlist
                    )
                    else -> SettingsScreen(
                        playlists = playlists,
                        activePlaylistId = activePlaylist?.id,
                        favorites = favorites,
                        autoRefresh = viewModel.autoRefreshEnabled(),
                        catalogRefreshInterval = viewModel.catalogRefreshInterval(),
                        epgRefreshInterval = viewModel.epgRefreshInterval(),
                        catalogRefreshTimes = catalogRefreshTimes,
                        playlistRefreshStates = playlistRefreshStates,
                        catalogRefreshInProgress = catalogRefreshInProgress,
                        epgLastFetched = epgLastFetched,
                        epgRefreshInProgress = epgRefreshInProgress,
                        theme = preferences.getString("theme", "system") ?: "system",
                        onAddPlaylist = viewModel::savePlaylist,
                        onActivatePlaylist = viewModel::activatePlaylist,
                        onRefreshPlaylist = viewModel::refreshPlaylist,
                        onDeletePlaylist = viewModel::deletePlaylist,
                        onToggleAutoRefresh = viewModel::setAutoRefresh,
                        onEpgRefreshIntervalChanged = viewModel::setEpgRefreshInterval,
                        onResetFavorites = viewModel::resetFavorites,
                        onCatalogRefreshIntervalChanged = viewModel::setCatalogRefreshInterval,
                        onRefreshCatalogs = viewModel::refreshCatalogs,
                        onRefreshGuide = viewModel::refreshGuide,
                        onClearGuide = viewModel::clearGuideCache,
                        openSubtitlesConfigured = openSubtitlesConfigured,
                        onSaveOpenSubtitlesApiKey = viewModel::setOpenSubtitlesApiKey,
                        onCreateBackup = viewModel::createEncryptedBackup,
                        onPreviewRestoreBackup = viewModel::previewRestoreBackup,
                        onRestoreBackup = viewModel::restorePendingBackup,
                        onCancelBackupRestore = viewModel::cancelPendingBackupRestore,
                        onReportActionError = viewModel::reportActionError,
                        onActionFeedback = viewModel::notifyAction,
                        onDisplaySettingsRestored = {
                            theme = it.theme
                            catalogColumns = it.catalogColumns
                        },
                        onThemeChanged = { selectedTheme ->
                            theme = selectedTheme
                            preferences.edit { putString("theme", selectedTheme) }
                            viewModel.notifyAction("Theme updated")
                        }
                    )
                }
                val currentCatalogLoaded = when (section) {
                    AppSection.LIVE -> channels.isNotEmpty()
                    AppSection.MOVIES -> movies.isNotEmpty()
                    AppSection.SERIES -> series.isNotEmpty()
                    AppSection.LIBRARY, AppSection.SETTINGS -> true
                }
                if (loading && !currentCatalogLoaded) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                }
            }
        }

        playerItem?.let { item ->
            Dialog(
                onDismissRequest = viewModel::closePlayer,
                properties = DialogProperties(usePlatformDefaultWidth = false)
            ) {
                PlayerScreen(
                    url = item.url,
                    title = item.title,
                    drmLicenseUrl = item.drmLicenseUrl,
                    libraryItem = item.libraryItem,
                    resumePositionMillis = item.resumePositionMillis,
                    guidePrograms = guidePrograms,
                    openSubtitlesApiKey = viewModel::openSubtitlesApiKey,
                    subtitleSearchQuery = item.subtitleSearchQuery,
                    isLive = item.isLive,
                    onProgress = viewModel::updatePlaybackProgress,
                    onClose = viewModel::closePlayer
                )
            }
        }
    }
}

@Composable
private fun LiveScreen(
    channels: List<LiveChannel>,
    favorites: List<Favorite>,
    guidePrograms: List<com.tivihub.data.model.EpgProgram>,
    loading: Boolean,
    search: String,
    onSearchChanged: (String) -> Unit,
    onSelect: (LiveChannel) -> Unit,
    onPlay: (LiveChannel) -> Unit,
    onFavorite: (LiveChannel) -> Unit
) {
    var selectedGroup by rememberSaveable { mutableStateOf("All groups") }
    var showGuide by rememberSaveable { mutableStateOf(false) }
    var searchExpanded by rememberSaveable { mutableStateOf(false) }
    val groups = listOf("All groups", "Favorites") +
        channels.map(LiveChannel::group).distinct().filterNot { it == "All groups" || it == "Favorites" }.sorted()
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CategoryPicker(groups, selectedGroup) { selectedGroup = it }
            Spacer(Modifier.weight(1f))
            SearchToggle(searchExpanded) { searchExpanded = it }
            IconButton(
                onClick = { showGuide = !showGuide },
                modifier = Modifier.semantics {
                    contentDescription = if (showGuide) "Show channels" else "Show TV guide"
                }
            ) {
                Icon(
                    Icons.Default.MenuBook,
                    contentDescription = null,
                    tint = if (showGuide) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        ExpandableSearchField(searchExpanded, search, "Search channels", onSearchChanged) {
            searchExpanded = false
        }
        val visible = channels.filter {
            it.name.contains(search, ignoreCase = true) &&
                when (selectedGroup) {
                    "All groups" -> true
                    "Favorites" -> favorites.any { favorite ->
                        favorite.contentType == ContentType.LIVE && favorite.contentId == it.id
                    }
                    else -> it.group == selectedGroup
                }
        }
        if (visible.isEmpty() && !loading) EmptyState("No channels", "Add or select a playlist in Settings.")
        if (showGuide) {
            LiveGuideGrid(
                channels = visible,
                programs = guidePrograms,
                onSelect = onSelect
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(bottom = 20.dp)) {
                items(visible, key = LiveChannel::id) { channel ->
                    val isFavorite = favorites.any {
                        it.contentId == channel.id && it.playlistId == channel.playlistId
                    }
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                    Row(
                        Modifier.fillMaxWidth().clickable { onSelect(channel) }.padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Artwork(channel.logoUrl, Modifier.size(54.dp).clip(RoundedCornerShape(12.dp)), "Live TV")
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text(channel.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(channel.group, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { onFavorite(channel) }) {
                            Icon(
                                imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                contentDescription = if (isFavorite) {
                                    "Remove ${channel.name} from favorites"
                                } else {
                                    "Add ${channel.name} to favorites"
                                },
                                tint = if (isFavorite) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        }
                        FilledIconButton(onClick = { onPlay(channel) }) {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Play ${channel.name}")
                        }
                    }
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveGuideGrid(
    channels: List<LiveChannel>,
    programs: List<com.tivihub.data.model.EpgProgram>,
    onSelect: (LiveChannel) -> Unit
) {
    val now = System.currentTimeMillis()
    val hourMillis = 60 * 60 * 1000L
    val timelineStart = now / hourMillis * hourMillis
    val timelineEnd = timelineStart + 12 * hourMillis
    val pixelsPerMinute = 2.5f
    val hourWidth = (60 * pixelsPerMinute).dp
    val timelineWidth = (12 * hourWidth.value).dp
    val horizontalScroll = rememberScrollState()
    val timeFormat = remember { DateFormat.getTimeInstance(DateFormat.SHORT) }
    val programsByChannel = remember(programs) { programs.groupBy { it.channelId } }

    if (programs.isEmpty()) {
        EmptyState("No guide data", "Refresh EPG in Settings to load the programme schedule.")
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "CHANNEL",
                Modifier.width(112.dp).padding(horizontal = 10.dp, vertical = 12.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(Modifier.horizontalScroll(horizontalScroll)) {
                repeat(12) { index ->
                    val time = timelineStart + index * hourMillis
                    Text(
                        DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(time)),
                        Modifier.width(hourWidth).padding(vertical = 12.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 20.dp)) {
            items(channels, key = LiveChannel::id) { channel ->
                val channelPrograms = programsByChannel[channel.tvgId].orEmpty()
                    .filter { it.startMillis < timelineEnd && it.endMillis > timelineStart }
                Row(
                    Modifier.fillMaxWidth().height(76.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(
                        Modifier.width(112.dp).fillMaxHeight()
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.48f))
                            .clickable { onSelect(channel) }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Artwork(
                            channel.logoUrl,
                            Modifier.size(30.dp).clip(RoundedCornerShape(6.dp)),
                            channel.name
                        )
                        Text(
                            channel.name,
                            Modifier.padding(top = 3.dp),
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Box(
                        Modifier.weight(1f).fillMaxHeight().horizontalScroll(horizontalScroll)
                            .background(MaterialTheme.colorScheme.background)
                    ) {
                        Box(Modifier.width(timelineWidth).fillMaxHeight()) {
                            channelPrograms.forEachIndexed { index, program ->
                                val clippedStart = maxOf(program.startMillis, timelineStart)
                                val clippedEnd = minOf(program.endMillis, timelineEnd)
                                val startOffset = ((clippedStart - timelineStart) / 60_000f * pixelsPerMinute).dp
                                val width = ((clippedEnd - clippedStart) / 60_000f * pixelsPerMinute).dp
                                val progress = if (program.startMillis <= now && program.endMillis > now) {
                                    ((now - program.startMillis).toFloat() /
                                        (program.endMillis - program.startMillis)).coerceIn(0f, 1f)
                                } else 0f
                                Card(
                                    Modifier.offset(x = startOffset, y = 4.dp)
                                        .width(width.coerceAtLeast(1.dp))
                                        .height(68.dp)
                                        .padding(end = 2.dp)
                                        .clickable { onSelect(channel) },
                                    shape = RoundedCornerShape(6.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = if (progress > 0f) {
                                            MaterialTheme.colorScheme.primaryContainer
                                        } else if (index % 2 == 0) {
                                            MaterialTheme.colorScheme.surfaceVariant
                                        } else {
                                            MaterialTheme.colorScheme.surface
                                        }
                                    )
                                ) {
                                    Column(
                                        Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 6.dp),
                                        verticalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Text(
                                            program.title,
                                            style = MaterialTheme.typography.labelMedium,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            "${timeFormat.format(Date(program.startMillis))} – ${timeFormat.format(Date(program.endMillis))}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1
                                        )
                                        if (progress > 0f) {
                                            LinearProgressIndicator(
                                                progress = { progress },
                                                modifier = Modifier.fillMaxWidth().height(3.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveChannelDetailsScreen(
    channel: LiveChannel,
    programs: List<com.tivihub.data.model.EpgProgram>,
    favorite: Boolean,
    onBack: () -> Unit,
    onPlay: () -> Unit,
    onFavorite: () -> Unit,
    onRefreshGuide: () -> Unit
) {
    val now = System.currentTimeMillis()
    val currentProgram = programs.firstOrNull { it.startMillis <= now && it.endMillis > now }
    val upcomingPrograms = programs.filter { it.startMillis > now }.take(12)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TextButton(onClick = onBack) { Text("‹  Live TV") }
        Artwork(
            channel.logoUrl,
            Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(16.dp)),
            channel.name
        )
        Text(channel.name, style = MaterialTheme.typography.headlineSmall)
        Text(
            buildList {
                add(channel.group)
                channel.tvgId?.takeIf(String::isNotBlank)?.let { add("Guide ID: $it") }
            }.joinToString("  ·  "),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Button(onClick = onPlay, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Watch live")
        }
        OutlinedButton(onClick = onFavorite, modifier = Modifier.fillMaxWidth()) {
            Icon(
                imageVector = if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = null,
                tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.width(8.dp))
            Text(if (favorite) "Favorited" else "Add to favorites")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("TV guide", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = onRefreshGuide) { Text("Refresh") }
        }
        if (currentProgram != null) {
            Text("Now playing", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            GuideProgramRow(currentProgram)
        }
        if (upcomingPrograms.isNotEmpty()) {
            Text(
                if (currentProgram == null) "Schedule" else "Coming up",
                style = MaterialTheme.typography.titleSmall
            )
            upcomingPrograms.forEach { GuideProgramRow(it) }
        } else if (currentProgram == null) {
            Text(
                if (channel.tvgId.isNullOrBlank()) {
                    "This channel has no guide ID in the playlist, so its schedule cannot be matched."
                } else {
                    "No cached guide data for this channel. Refresh the active Xtream playlist EPG in Settings."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun GuideProgramRow(program: com.tivihub.data.model.EpgProgram) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(program.startMillis))} – ${
                    DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(program.endMillis))
                }",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(program.title, style = MaterialTheme.typography.titleSmall)
            program.synopsis?.takeIf(String::isNotBlank)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CategoryPicker(
    options: List<String>,
    selected: String,
    modifier: Modifier = Modifier,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier.padding(bottom = 8.dp)) {
        OutlinedButton(onClick = { expanded = true }) { Text(selected) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { group ->
                DropdownMenuItem(
                    text = { Text(group) },
                    onClick = {
                        onSelect(group)
                        expanded = false
                    }
                )
            }
        }
    }
}

private enum class CatalogSortOption(val label: String) {
    NAME("Name A-Z"),
    RECENTLY_ADDED("Recently added"),
    RATING("Highest rated"),
    YEAR("Newest year")
}

@Composable
private fun CatalogSortPicker(
    options: List<CatalogSortOption>,
    selected: CatalogSortOption,
    onSelect: (CatalogSortOption) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(
            onClick = { expanded = true },
            modifier = Modifier.semantics { contentDescription = "Sort catalog" }
        ) {
            Icon(Icons.Default.FilterList, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        onSelect(option)
                        expanded = false
                    },
                    trailingIcon = if (selected == option) {
                        { Icon(Icons.Default.Check, contentDescription = "Selected") }
                    } else {
                        null
                    }
                )
            }
        }
    }
}

@Composable
private fun CatalogViewPicker(
    columns: Int,
    onColumnsChanged: (Int) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val options = listOf(0, 2, 3, 4)
    Box {
        IconButton(
            onClick = { expanded = true },
            modifier = Modifier.semantics {
                contentDescription = if (columns == 0) {
                    "Catalog grid: automatic columns"
                } else {
                    "Catalog grid: $columns columns"
                }
            }
        ) {
            Icon(Icons.Default.GridView, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Text(if (option == 0) "Automatic (recommended)" else "$option columns")
                    },
                    onClick = {
                        onColumnsChanged(option)
                        expanded = false
                    },
                    trailingIcon = if (columns == option) {
                        { Icon(Icons.Default.Check, contentDescription = "Selected") }
                    } else {
                        null
                    }
                )
            }
        }
    }
}

@Composable
private fun SearchToggle(expanded: Boolean, onExpandedChange: (Boolean) -> Unit) {
    IconButton(
        onClick = { onExpandedChange(!expanded) },
        modifier = Modifier.semantics {
            contentDescription = if (expanded) "Close search" else "Search"
        }
    ) {
        Icon(
            if (expanded) Icons.Default.Close else Icons.Default.Search,
            contentDescription = null
        )
    }
}

@Composable
private fun ExpandableSearchField(
    expanded: Boolean,
    query: String,
    label: String,
    onQueryChanged: (String) -> Unit,
    onClose: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    LaunchedEffect(expanded) {
        if (expanded) {
            focusRequester.requestFocus()
            keyboardController?.show()
        } else {
            keyboardController?.hide()
        }
    }
    AnimatedVisibility(
        visible = expanded,
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut()
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChanged,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .focusRequester(focusRequester),
            label = { Text(label) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                IconButton(onClick = onClose) {
                    Icon(Icons.Default.Close, contentDescription = "Close search")
                }
            },
            singleLine = true
        )
    }
}

@Composable
private fun MoviesScreen(
    movies: List<Movie>,
    favorites: List<Favorite>,
    libraryItems: List<LibraryItem>,
    playlistId: String?,
    loading: Boolean,
    enabled: Boolean,
    search: String,
    onSearchChanged: (String) -> Unit,
    columns: Int,
    onColumnsChanged: (Int) -> Unit,
    onPlay: (Movie) -> Unit,
    onToggleLibrary: (Movie) -> Unit
) {
    var selectedCategory by rememberSaveable { mutableStateOf("All categories") }
    var selectedSort by rememberSaveable { mutableStateOf(CatalogSortOption.RECENTLY_ADDED) }
    var searchExpanded by rememberSaveable { mutableStateOf(false) }
    if (!enabled) {
        EmptyState("Xtream playlist required", "Movies are available from Xtream playlists.")
        return
    }
    Column {
        val categories = listOf("All categories") + movies.mapNotNull(Movie::category)
            .distinct().sortedBy(String::lowercase)
        LaunchedEffect(categories) {
            if (selectedCategory !in categories) selectedCategory = "All categories"
        }
        val sortOptions = buildList {
            add(CatalogSortOption.NAME)
            if (movies.any { it.addedAtMillis != null }) add(CatalogSortOption.RECENTLY_ADDED)
            if (movies.any { it.rating != null }) add(CatalogSortOption.RATING)
            if (movies.any { it.year != null }) add(CatalogSortOption.YEAR)
        }
        LaunchedEffect(sortOptions) {
            if (movies.isNotEmpty() && selectedSort !in sortOptions) {
                selectedSort = CatalogSortOption.NAME
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CategoryPicker(categories, selectedCategory) { selectedCategory = it }
            Spacer(Modifier.weight(1f))
            SearchToggle(searchExpanded) { searchExpanded = it }
            CatalogViewPicker(columns, onColumnsChanged)
            CatalogSortPicker(sortOptions, selectedSort) { selectedSort = it }
        }
        ExpandableSearchField(searchExpanded, search, "Search movies", onSearchChanged) {
            searchExpanded = false
        }
        val filtered = movies.filter {
            it.name.contains(search, ignoreCase = true) &&
                (selectedCategory == "All categories" || it.category == selectedCategory)
        }
        val visible = when (selectedSort) {
            CatalogSortOption.NAME -> filtered.sortedBy { it.name.lowercase() }
            CatalogSortOption.RECENTLY_ADDED -> filtered.sortedWith(
                compareBy<Movie> { it.addedAtMillis == null }
                    .thenByDescending { it.addedAtMillis }
                    .thenBy { it.name.lowercase() }
            )
            CatalogSortOption.RATING -> filtered.sortedWith(
                compareBy<Movie> { it.rating == null }
                    .thenByDescending { it.rating }
                    .thenBy { it.name.lowercase() }
            )
            CatalogSortOption.YEAR -> filtered.sortedWith(
                compareBy<Movie> { it.year == null }
                    .thenByDescending { it.year }
                    .thenBy { it.name.lowercase() }
            )
        }
        if (visible.isEmpty() && !loading) EmptyState("No movies", "Your Xtream playlist returned no movies.")
        LazyVerticalGrid(
            columns = if (columns == 0) GridCells.Adaptive(145.dp) else GridCells.Fixed(columns),
            contentPadding = PaddingValues(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(visible, key = Movie::id) { movie ->
                PosterCard(
                    title = movie.name,
                    artwork = movie.posterUrl,
                    inLibrary = isInLibrary(movie.id, ContentType.MOVIE, playlistId, favorites, libraryItems),
                    onClick = { onPlay(movie) },
                    onToggleLibrary = { onToggleLibrary(movie) }
                )
            }
        }
    }
}

@Composable
private fun SeriesScreen(
    series: List<Series>,
    favorites: List<Favorite>,
    libraryItems: List<LibraryItem>,
    playlistId: String?,
    loading: Boolean,
    enabled: Boolean,
    search: String,
    onSearchChanged: (String) -> Unit,
    columns: Int,
    onColumnsChanged: (Int) -> Unit,
    onSelect: (Series) -> Unit,
    onToggleLibrary: (Series) -> Unit
) {
    var selectedCategory by rememberSaveable { mutableStateOf("All categories") }
    var selectedSort by rememberSaveable { mutableStateOf(CatalogSortOption.RECENTLY_ADDED) }
    var searchExpanded by rememberSaveable { mutableStateOf(false) }
    if (!enabled) {
        EmptyState("Xtream playlist required", "Series are available from Xtream playlists.")
        return
    }
    Column {
        val categories = listOf("All categories") + series.mapNotNull(Series::category)
            .distinct().sortedBy(String::lowercase)
        LaunchedEffect(categories) {
            if (selectedCategory !in categories) selectedCategory = "All categories"
        }
        val sortOptions = buildList {
            add(CatalogSortOption.NAME)
            if (series.any { it.addedAtMillis != null }) add(CatalogSortOption.RECENTLY_ADDED)
            if (series.any { it.rating != null }) add(CatalogSortOption.RATING)
            if (series.any { it.year != null }) add(CatalogSortOption.YEAR)
        }
        LaunchedEffect(sortOptions) {
            if (series.isNotEmpty() && selectedSort !in sortOptions) {
                selectedSort = CatalogSortOption.NAME
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CategoryPicker(categories, selectedCategory) { selectedCategory = it }
            Spacer(Modifier.weight(1f))
            SearchToggle(searchExpanded) { searchExpanded = it }
            CatalogViewPicker(columns, onColumnsChanged)
            CatalogSortPicker(sortOptions, selectedSort) { selectedSort = it }
        }
        ExpandableSearchField(searchExpanded, search, "Search series", onSearchChanged) {
            searchExpanded = false
        }
        val filtered = series.filter {
            it.name.contains(search, ignoreCase = true) &&
                (selectedCategory == "All categories" || it.category == selectedCategory)
        }
        val visible = when (selectedSort) {
            CatalogSortOption.NAME -> filtered.sortedBy { it.name.lowercase() }
            CatalogSortOption.RECENTLY_ADDED -> filtered.sortedWith(
                compareBy<Series> { it.addedAtMillis == null }
                    .thenByDescending { it.addedAtMillis }
                    .thenBy { it.name.lowercase() }
            )
            CatalogSortOption.RATING -> filtered.sortedWith(
                compareBy<Series> { it.rating == null }
                    .thenByDescending { it.rating }
                    .thenBy { it.name.lowercase() }
            )
            CatalogSortOption.YEAR -> filtered.sortedWith(
                compareBy<Series> { it.year == null }
                    .thenByDescending { it.year }
                    .thenBy { it.name.lowercase() }
            )
        }
        if (visible.isEmpty() && !loading) EmptyState("No series", "Your Xtream playlist returned no series.")
        LazyVerticalGrid(
            columns = if (columns == 0) GridCells.Adaptive(145.dp) else GridCells.Fixed(columns),
            contentPadding = PaddingValues(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(visible, key = Series::id) { item ->
                PosterCard(
                    item.name,
                    item.posterUrl,
                    isInLibrary(item.id, ContentType.SERIES, playlistId, favorites, libraryItems),
                    { onSelect(item) },
                    { onToggleLibrary(item) }
                )
            }
        }
    }
}

@Composable
private fun MovieDetailsScreen(
    movie: Movie,
    loading: Boolean,
    inLibrary: Boolean,
    onBack: () -> Unit,
    onPlay: () -> Unit,
    onToggleLibrary: () -> Unit
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        TextButton(onClick = onBack) { Text("‹  Movies") }
        DetailHero(movie.posterUrl, movie.name)
        val metadata = listOfNotNull(
            movie.year?.toString(),
            movie.rating?.let { "★ ${"%.1f".format(it)}" },
            movie.category
        ).joinToString("  ·  ")
        if (metadata.isNotBlank()) {
            Text(metadata, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!movie.overview.isNullOrBlank()) {
            Text(movie.overview, style = MaterialTheme.typography.bodyLarge)
        } else if (loading) {
            Text("Loading movie information…", style = MaterialTheme.typography.bodyMedium)
        } else {
            Text("No synopsis provided by the playlist.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Button(onClick = onPlay, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Play movie")
        }
        OutlinedButton(onClick = onToggleLibrary, modifier = Modifier.fillMaxWidth()) {
            Icon(
                if (inLibrary) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                contentDescription = null,
                tint = if (inLibrary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.width(6.dp))
            Text(if (inLibrary) "Remove from library" else "Add to library")
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun EpisodesScreen(
    series: Series,
    episodes: List<com.tivihub.data.model.Episode>,
    loading: Boolean,
    inLibrary: Boolean,
    onBack: () -> Unit,
    onToggleLibrary: () -> Unit,
    onPlay: (com.tivihub.data.model.Episode) -> Unit
) {
    val seasons = episodes.map(com.tivihub.data.model.Episode::season).distinct().sorted()
    var selectedSeason by rememberSaveable(series.id) { mutableStateOf<Int?>(null) }
    var seasonMenuExpanded by remember { mutableStateOf(false) }
    LaunchedEffect(seasons) {
        if (selectedSeason !in seasons) selectedSeason = seasons.firstOrNull()
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn {
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    TextButton(onClick = onBack) { Text("‹  Series") }
                    DetailHero(series.posterUrl, series.name)
                    Spacer(Modifier.height(12.dp))
                    val metadata = listOfNotNull(
                        series.seasons.takeIf { it > 0 }?.let { "$it seasons" },
                        series.category
                    ).joinToString("  ·  ")
                    if (metadata.isNotBlank()) {
                        Text(metadata, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    series.overview?.takeIf(String::isNotBlank)?.let {
                        Text(it, Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyLarge)
                    }
                    OutlinedButton(onClick = onToggleLibrary, modifier = Modifier.fillMaxWidth()) {
                        Icon(
                            if (inLibrary) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = null,
                            tint = if (inLibrary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(if (inLibrary) "Remove from library" else "Add to library")
                    }
                    Text(
                        "Episodes",
                        Modifier.padding(top = 18.dp, bottom = 4.dp),
                        style = MaterialTheme.typography.titleLarge
                    )
                    if (seasons.isNotEmpty()) {
                        ExposedDropdownMenuBox(
                            expanded = seasonMenuExpanded,
                            onExpandedChange = { seasonMenuExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = selectedSeason?.let { "Season $it" }.orEmpty(),
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Select season") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(seasonMenuExpanded) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            )
                            ExposedDropdownMenu(
                                expanded = seasonMenuExpanded,
                                onDismissRequest = { seasonMenuExpanded = false }
                            ) {
                                seasons.forEach { season ->
                                    DropdownMenuItem(
                                        text = { Text("Season $season") },
                                        onClick = {
                                            selectedSeason = season
                                            seasonMenuExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (episodes.isEmpty() && !loading) {
                item { EmptyState("No episodes", "Episode data was not returned.") }
            }
            if (loading && episodes.isEmpty()) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(20.dp),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
            items(
                episodes.filter { it.season == selectedSeason }.sortedBy { it.number },
                key = { it.id }
            ) { episode ->
                Row(
                    Modifier.fillMaxWidth().clickable { onPlay(episode) }.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("${episode.number}", color = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(episode.name, style = MaterialTheme.typography.titleSmall)
                        episode.overview?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                    }
                    Icon(Icons.Default.PlayArrow, contentDescription = "Play ${episode.name}")
                }
            }
        }
    }
}

@Composable
private fun LibraryScreen(
    favorites: List<Favorite>,
    libraryItems: List<LibraryItem>,
    onOpenFavorite: (Favorite) -> Unit,
    onOpenItem: (LibraryItem) -> Unit,
    onOpenSavedItem: (LibraryItem) -> Unit,
    onRemoveFavorite: (Favorite) -> Unit,
    onStatusChanged: (LibraryItem, LibraryStatus) -> Unit,
    onRemoveFromWatchlist: (LibraryItem) -> Unit
) {
    val tabs = listOf("Saved", "Watching", "Watched")
    var selectedTab by rememberSaveable { mutableStateOf("Saved") }
    var selectedSavedSection by rememberSaveable { mutableStateOf("Live TV") }
    val liveFavorites = favorites.filter { it.contentType == ContentType.LIVE }
    val savedItems = buildList {
        addAll(libraryItems.filter { it.status == LibraryStatus.WATCHLIST })
        favorites.filter { favorite ->
            favorite.contentType == ContentType.MOVIE || favorite.contentType == ContentType.SERIES
        }.filterNot { favorite ->
            libraryItems.any {
                it.contentId == favorite.contentId &&
                    it.contentType == favorite.contentType &&
                    it.playlistId == favorite.playlistId
            }
        }.forEach { favorite ->
            add(
                LibraryItem(
                    id = favorite.id,
                    contentId = favorite.contentId,
                    contentType = favorite.contentType,
                    playlistId = favorite.playlistId,
                    title = favorite.title,
                    streamUrl = favorite.streamUrl,
                    artworkUrl = favorite.artworkUrl,
                    status = LibraryStatus.WATCHLIST,
                    updatedAt = favorite.addedAt
                )
            )
        }
    }.sortedByDescending(LibraryItem::updatedAt)
    val savedCounts = mapOf(
        "Live TV" to liveFavorites.size,
        "Movies" to savedItems.count { it.contentType == ContentType.MOVIE },
        "Series" to savedItems.count { it.contentType == ContentType.SERIES }
    )
    Column(Modifier.fillMaxSize()) {
        Text("Your library", Modifier.padding(start = 16.dp, top = 16.dp), style = MaterialTheme.typography.titleLarge)
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            tabs.forEach { tab ->
                FilterChip(
                    selected = selectedTab == tab,
                    onClick = { selectedTab = tab },
                    label = { Text(tab) },
                    colors = libraryChipColors()
                )
            }
        }
        if (selectedTab == "Saved") {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("Live TV", "Movies", "Series").forEach { subsection ->
                    FilterChip(
                        selected = selectedSavedSection == subsection,
                        onClick = { selectedSavedSection = subsection },
                        label = { Text("$subsection (${savedCounts.getValue(subsection)})") },
                        colors = libraryChipColors()
                    )
                }
            }
            val visibleLiveFavorites = liveFavorites
                .filter { selectedSavedSection == "Live TV" }
            val visibleSavedItems = savedItems.filter {
                when (selectedSavedSection) {
                    "Movies" -> it.contentType == ContentType.MOVIE
                    "Series" -> it.contentType == ContentType.SERIES
                    else -> false
                }
            }
            if (visibleLiveFavorites.isEmpty() && visibleSavedItems.isEmpty()) {
                val (title, message) = when (selectedSavedSection) {
                    "Live TV" -> "No favorite channels" to "Favorite a live channel to see it here."
                    "Movies" -> "No saved movies" to "Add a movie to your Library to see it here."
                    else -> "No saved series" to "Add a series to your Library to see it here."
                }
                EmptyState(title, message)
            } else {
                LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                    items(visibleLiveFavorites, key = Favorite::id) { favorite ->
                        Card(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Row(
                                Modifier.fillMaxWidth().clickable { onOpenFavorite(favorite) }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Artwork(favorite.artworkUrl, Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)), favorite.title)
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(favorite.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(favorite.contentType.name.lowercase().replaceFirstChar(Char::uppercase), style = MaterialTheme.typography.bodySmall)
                                }
                                IconButton(onClick = { onRemoveFavorite(favorite) }) {
                                    Icon(Icons.Default.Favorite, contentDescription = "Remove favorite", tint = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                    items(visibleSavedItems, key = { "saved_${it.playlistId}_${it.contentType}_${it.contentId}" }) { item ->
                        Card(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Row(
                                Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Artwork(
                                    item.artworkUrl,
                                    Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)).clickable {
                                        onOpenSavedItem(item)
                                    },
                                    item.title
                                )
                                Column(
                                    Modifier.weight(1f).padding(horizontal = 12.dp).clickable {
                                        onOpenSavedItem(item)
                                    }
                                ) {
                                    Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(item.contentType.name.lowercase().replaceFirstChar(Char::uppercase), style = MaterialTheme.typography.bodySmall)
                                }
                                TextButton(onClick = { onOpenItem(item) }) {
                                    Text(if (item.contentType == ContentType.SERIES) "Open" else "Play")
                                }
                                IconButton(onClick = { onRemoveFromWatchlist(item) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Remove from library")
                                }
                            }
                        }
                    }
                }
            }
        } else {
            val selectedStatus = when (selectedTab) {
                "Watching" -> LibraryStatus.WATCHING
                else -> LibraryStatus.WATCHED
            }
            val visibleItems = libraryItems.filter { it.status == selectedStatus }
            if (visibleItems.isEmpty()) {
                EmptyState(
                    when (selectedStatus) {
                        LibraryStatus.WATCHLIST -> "Your library is empty"
                        LibraryStatus.WATCHING -> "Nothing in progress"
                        LibraryStatus.WATCHED -> "No watched titles yet"
                    },
                    when (selectedStatus) {
                        LibraryStatus.WATCHLIST -> "Save a movie or series to see it here."
                        LibraryStatus.WATCHING -> "Play a movie or episode and your progress will be saved here."
                        LibraryStatus.WATCHED -> "Titles move here automatically when playback is nearly complete."
                    }
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                    items(visibleItems, key = LibraryItem::id) { item ->
                        Card(
                            Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Artwork(
                                        item.artworkUrl,
                                        Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)).clickable {
                                            onOpenItem(item)
                                        },
                                        item.title
                                    )
                                    Column(
                                        Modifier.weight(1f).padding(horizontal = 12.dp).clickable {
                                            onOpenItem(item)
                                        }
                                    ) {
                                        Text(
                                            item.parentTitle?.let { "$it · ${item.title}" } ?: item.title,
                                            style = MaterialTheme.typography.titleSmall,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            if (item.contentType == ContentType.EPISODE) "Episode" else item.contentType.name.lowercase().replaceFirstChar(Char::uppercase),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    TextButton(onClick = { onOpenItem(item) }) {
                                        Text(if (item.contentType == ContentType.SERIES) "Open" else if (item.status == LibraryStatus.WATCHING) "Resume" else "Play")
                                    }
                                }
                                if (item.durationMillis > 0L) {
                                    LinearProgressIndicator(
                                        progress = { (item.positionMillis.toFloat() / item.durationMillis).coerceIn(0f, 1f) },
                                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                                    TextButton(onClick = { onRemoveFromWatchlist(item) }) { Text("Remove") }
                                    if (item.status != LibraryStatus.WATCHLIST) {
                                        TextButton(onClick = { onStatusChanged(item, LibraryStatus.WATCHLIST) }) { Text("Saved") }
                                    }
                                    if (item.status != LibraryStatus.WATCHED) {
                                        TextButton(onClick = { onStatusChanged(item, LibraryStatus.WATCHED) }) { Text("Mark watched") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private enum class SettingsSection(
    val title: String,
    val description: String,
    val icon: ImageVector
) {
    PLAYLISTS("Playlists & catalogs", "Sources, refresh schedule and catalog updates", Icons.Default.LiveTv),
    GUIDE("TV guide (EPG)", "Programme guide refresh and cache", Icons.Default.MenuBook),
    SUBTITLES("Subtitles", "OpenSubtitles online provider", Icons.Default.ClosedCaption),
    APPEARANCE("Appearance", "Light, dark or system theme", Icons.Default.Palette),
    BACKUP("Backup & data", "Encrypted backup, restore and favorites", Icons.Default.Backup),
    LEGAL("Legal & privacy", "Content rights and privacy information", Icons.Default.Gavel)
}

@Composable
private fun libraryChipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
)

@Composable
private fun SettingsMenu(onSelect: (SettingsSection) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Settings", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 8.dp)) }
        items(SettingsSection.entries, key = SettingsSection::name) { entry ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    Modifier.fillMaxWidth().clickable { onSelect(entry) }.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(entry.icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(entry.title, style = MaterialTheme.typography.titleMedium)
                        Text(
                            entry.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    playlists: List<Playlist>,
    activePlaylistId: String?,
    favorites: List<Favorite>,
    autoRefresh: Boolean,
    catalogRefreshInterval: CatalogRefreshInterval,
    epgRefreshInterval: CatalogRefreshInterval,
    catalogRefreshTimes: Map<String, Map<String, Long>>,
    playlistRefreshStates: Map<String, PlaylistRefreshState>,
    catalogRefreshInProgress: Boolean,
    epgLastFetched: Long?,
    epgRefreshInProgress: Boolean,
    theme: String,
    onAddPlaylist: (Playlist) -> Unit,
    onActivatePlaylist: (Playlist) -> Unit,
    onRefreshPlaylist: (Playlist) -> Unit,
    onDeletePlaylist: (Playlist) -> Unit,
    onToggleAutoRefresh: (Boolean) -> Unit,
    onEpgRefreshIntervalChanged: (CatalogRefreshInterval) -> Unit,
    onResetFavorites: () -> Unit,
    onCatalogRefreshIntervalChanged: (CatalogRefreshInterval) -> Unit,
    onRefreshCatalogs: () -> Unit,
    onRefreshGuide: () -> Unit,
    onClearGuide: () -> Unit,
    openSubtitlesConfigured: Boolean,
    onSaveOpenSubtitlesApiKey: (String) -> Unit,
    onCreateBackup: suspend (CharArray) -> ByteArray,
    onPreviewRestoreBackup: suspend (ByteArray, CharArray) -> BackupSummary,
    onRestoreBackup: suspend () -> BackupDisplaySettings,
    onCancelBackupRestore: () -> Unit,
    onReportActionError: (Exception) -> Unit,
    onActionFeedback: (String) -> Unit,
    onDisplaySettingsRestored: (BackupDisplaySettings) -> Unit,
    onThemeChanged: (String) -> Unit
) {
    var showPlaylistEditor by remember { mutableStateOf(false) }
    var editingPlaylist by remember { mutableStateOf<Playlist?>(null) }
    var refreshMenuExpanded by remember { mutableStateOf(false) }
    var epgRefreshMenuExpanded by remember { mutableStateOf(false) }
    var confirmResetFavorites by remember { mutableStateOf(false) }
    var showExportPasswordDialog by remember { mutableStateOf(false) }
    var legalInfo by remember { mutableStateOf<LegalInfo?>(null) }
    var openSubtitlesApiKey by remember { mutableStateOf("") }
    var restoreUri by remember { mutableStateOf<Uri?>(null) }
    var exportPassword by remember { mutableStateOf("") }
    var exportPasswordConfirmation by remember { mutableStateOf("") }
    var restorePassword by remember { mutableStateOf("") }
    var backupPasswordError by remember { mutableStateOf<String?>(null) }
    var backupPreview by remember { mutableStateOf<BackupSummary?>(null) }
    var pendingExportBytes by remember { mutableStateOf<ByteArray?>(null) }
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri ->
        val bytes = pendingExportBytes
        pendingExportBytes = null
        if (uri != null && bytes != null) {
            coroutineScope.launch {
                try {
                    withContext(Dispatchers.IO) {
                        val output = context.contentResolver.openOutputStream(uri, "w")
                            ?: throw IllegalStateException("Could not open the selected backup destination.")
                        output.use { it.write(bytes) }
                    }
                    onActionFeedback("Encrypted backup exported")
                } catch (error: Exception) {
                    onReportActionError(error)
                } finally {
                    bytes.fill(0)
                }
            }
        } else {
            bytes?.fill(0)
        }
    }
    val restoreLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        restoreUri = uri
    }
    val liveFavoriteCount = favorites.count { it.contentType == ContentType.LIVE }
    var sectionName by rememberSaveable { mutableStateOf<String?>(null) }
    val section = SettingsSection.entries.firstOrNull { it.name == sectionName }
    BackHandler(enabled = section != null) { sectionName = null }
    if (section == null) {
        SettingsMenu(onSelect = { sectionName = it.name })
    } else LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { sectionName = null }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to settings")
                }
                Text(section.title, style = MaterialTheme.typography.titleLarge)
            }
        }
        if (section == SettingsSection.APPEARANCE) item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf("system", "light", "dark").forEach { choice ->
                    if (theme == choice) {
                        Button(onClick = { onThemeChanged(choice) }) {
                            Text(choice.replaceFirstChar(Char::uppercase))
                        }
                    } else {
                        TextButton(onClick = { onThemeChanged(choice) }) {
                            Text(choice.replaceFirstChar(Char::uppercase))
                        }
                    }
                }
            }
        }
        if (section == SettingsSection.BACKUP) item {
            Text(
                "Export playlists, favorites, library items, preferences, and credentials in a password-encrypted backup. Keep the password safe; it cannot be recovered.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    backupPasswordError = null
                    exportPassword = ""
                    exportPasswordConfirmation = ""
                    showExportPasswordDialog = true
                }) { Text("Create backup") }
                OutlinedButton(onClick = {
                    restorePassword = ""
                    backupPasswordError = null
                    restoreLauncher.launch(arrayOf("*/*"))
                }) { Text("Restore backup") }
            }
        }
        if (section == SettingsSection.PLAYLISTS) {
        item { Text("Catalog updates", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp)) }
        item {
            Text(
                "Keep a local copy of channels, movies, and series so they open quickly. Refreshing fetches the latest list from your provider.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            Box {
                OutlinedButton(onClick = { refreshMenuExpanded = true }) {
                    Text("Refresh: ${catalogRefreshInterval.label}")
                }
                DropdownMenu(
                    expanded = refreshMenuExpanded,
                    onDismissRequest = { refreshMenuExpanded = false }
                ) {
                    CatalogRefreshInterval.entries.forEach { interval ->
                        DropdownMenuItem(
                            text = { Text(interval.label) },
                            onClick = {
                                onCatalogRefreshIntervalChanged(interval)
                                refreshMenuExpanded = false
                            }
                        )
                    }
                }
            }
        }
        item {
            OutlinedButton(
                onClick = onRefreshCatalogs,
                enabled = !catalogRefreshInProgress,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (catalogRefreshInProgress) "Refreshing catalogs…" else "Refresh catalogs now")
            }
            if (catalogRefreshInProgress) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Text(
                    "Fetching channels, movies and series from your playlist provider. This can take a while.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            Text(
                "Use HTTPS providers when available. HTTP connections can expose credentials and streams.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item { Text("Playlist sources", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp)) }
        if (playlists.isEmpty()) item { Text("Add an M3U or Xtream playlist to begin.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(playlists, key = Playlist::id) { playlist ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                    Text(playlist.name, style = MaterialTheme.typography.titleMedium)
                    Text("${playlist.type.name} · ${playlist.url}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val playlistFetchTimes = catalogRefreshTimes[playlist.id].orEmpty()
                    val catalogFetchStatus = buildList {
                        add("Channels: ${formatFetchDateTime(playlistFetchTimes["live"])}")
                        if (playlist.type == PlaylistType.XTREAM) {
                            add("Movies: ${formatFetchDateTime(playlistFetchTimes["movies"])}")
                            add("Series: ${formatFetchDateTime(playlistFetchTimes["series"])}")
                        }
                    }.joinToString(" · ")
                    Text(
                        "Last fetched — $catalogFetchStatus",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    val refreshState = playlistRefreshStates[playlist.id]
                    if (refreshState?.inProgress == true) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            Text("Refreshing ${playlist.type.name} catalogs…", style = MaterialTheme.typography.bodySmall)
                        }
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    } else if (refreshState?.lastAttemptAt != null) {
                        Text(
                            "Last refresh ${if (refreshState.errorMessage == null) "succeeded" else "failed"}: " +
                                formatFetchDateTime(refreshState.lastAttemptAt),
                            style = MaterialTheme.typography.bodySmall,
                            color = if (refreshState.errorMessage == null) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.error
                            }
                        )
                    }
                    refreshState?.errorMessage?.let { message ->
                        Text(
                            message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    if (playlist.type == PlaylistType.XTREAM) {
                        val expiry = playlist.expiresAtMillis
                        if (expiry == null) {
                            Text(
                                "Expiry not provided by Xtream",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            val expired = expiry < System.currentTimeMillis()
                            Text(
                                if (expired) {
                                    "Subscription expired ${formatExpiryDate(expiry)}. Edit credentials or contact your provider."
                                } else {
                                    "Expires ${formatExpiryDate(expiry)}"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (expired) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (activePlaylistId == playlist.id) {
                            Text("Active", color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                        } else {
                            TextButton(onClick = { onActivatePlaylist(playlist) }) { Text("Set active") }
                            Spacer(Modifier.weight(1f))
                        }
                        TextButton(onClick = { editingPlaylist = playlist }) { Text("Edit") }
                        TextButton(
                            onClick = { onRefreshPlaylist(playlist) },
                            enabled = refreshState?.inProgress != true
                        ) { Text("Refresh") }
                        IconButton(onClick = { onDeletePlaylist(playlist) }) {
                            Icon(Icons.Default.Delete, "Delete playlist")
                        }
                    }
                }
            }
        }
        item { OutlinedButton(onClick = { showPlaylistEditor = true }, modifier = Modifier.fillMaxWidth()) { Text("Add playlist") } }
        }
        if (section == SettingsSection.GUIDE) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Automatically refresh", Modifier.weight(1f))
                Switch(checked = autoRefresh, onCheckedChange = onToggleAutoRefresh)
            }
        }
        item {
            Text("Refresh schedule", style = MaterialTheme.typography.titleMedium)
            Box {
                OutlinedButton(onClick = { epgRefreshMenuExpanded = true }) {
                    Text("Refresh: ${epgRefreshInterval.label}")
                }
                DropdownMenu(
                    expanded = epgRefreshMenuExpanded,
                    onDismissRequest = { epgRefreshMenuExpanded = false }
                ) {
                    CatalogRefreshInterval.entries.forEach { interval ->
                        DropdownMenuItem(
                            text = { Text(interval.label) },
                            onClick = {
                                onEpgRefreshIntervalChanged(interval)
                                epgRefreshMenuExpanded = false
                            }
                        )
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onRefreshGuide,
                    enabled = !epgRefreshInProgress
                ) {
                    Text(if (epgRefreshInProgress) "Refreshing…" else "Refresh now")
                }
                TextButton(
                    onClick = onClearGuide,
                    enabled = !epgRefreshInProgress
                ) { Text("Clear cache") }
            }
            if (epgRefreshInProgress) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Text(
                    "Loading programme guide from your playlist provider. This can take a while.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            Text(
                "Last fetched: ${formatFetchDateTime(epgLastFetched)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            Text(
                "EPG is fetched from the active Xtream playlist. M3U playlists do not provide this endpoint.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        }
        if (section == SettingsSection.SUBTITLES) item {
            Text("Online subtitle provider", style = MaterialTheme.typography.titleMedium)
            Text(
                if (openSubtitlesConfigured) {
                    "OpenSubtitles is configured. Embedded and online subtitle tracks are available in the player."
                } else {
                    "Embedded subtitle tracks work without setup. Add your OpenSubtitles API key to search online subtitles."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "Create an API key in your OpenSubtitles account, then save it here. The key is encrypted on this device.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = openSubtitlesApiKey,
                onValueChange = { openSubtitlesApiKey = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("OpenSubtitles API key") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        onSaveOpenSubtitlesApiKey(openSubtitlesApiKey)
                        openSubtitlesApiKey = ""
                    },
                    enabled = openSubtitlesApiKey.isNotBlank()
                ) { Text("Save API key") }
                if (openSubtitlesConfigured) {
                    TextButton(onClick = {
                        onSaveOpenSubtitlesApiKey("")
                        openSubtitlesApiKey = ""
                    }) { Text("Remove key") }
                }
            }
        }
        if (section == SettingsSection.BACKUP) item {
            OutlinedButton(
                onClick = { confirmResetFavorites = true },
                enabled = liveFavoriteCount > 0,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Reset favorites")
            }
        }
        if (section == SettingsSection.LEGAL) item {
            OutlinedButton(
                onClick = { legalInfo = LegalInfo.CONTENT_AND_RIGHTS },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Content & rights")
            }
        }
        if (section == SettingsSection.LEGAL) item {
            OutlinedButton(
                onClick = { legalInfo = LegalInfo.PRIVACY },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Privacy information")
            }
        }
    }
    if (showExportPasswordDialog) {
        AlertDialog(
            onDismissRequest = {
                showExportPasswordDialog = false
                exportPassword = ""
                exportPasswordConfirmation = ""
                backupPasswordError = null
            },
            title = { Text("Encrypt backup") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Choose a password with at least ${TiviHubBackupFile.MIN_PASSWORD_LENGTH} characters. You will need it to restore this backup.")
                    OutlinedTextField(
                        value = exportPassword,
                        onValueChange = { exportPassword = it; backupPasswordError = null },
                        label = { Text("Backup password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = exportPasswordConfirmation,
                        onValueChange = { exportPasswordConfirmation = it; backupPasswordError = null },
                        label = { Text("Confirm password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                    backupPasswordError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    when {
                        exportPassword.length < TiviHubBackupFile.MIN_PASSWORD_LENGTH ->
                            backupPasswordError = "Use at least ${TiviHubBackupFile.MIN_PASSWORD_LENGTH} characters."
                        exportPassword != exportPasswordConfirmation ->
                            backupPasswordError = "The passwords do not match."
                        else -> {
                            val password = exportPassword.toCharArray()
                            showExportPasswordDialog = false
                            exportPassword = ""
                            exportPasswordConfirmation = ""
                            backupPasswordError = null
                            coroutineScope.launch {
                                try {
                                    val bytes = onCreateBackup(password)
                                    pendingExportBytes = bytes
                                    try {
                                        exportLauncher.launch("TiviHub-backup.tivihub-backup")
                                    } catch (error: Exception) {
                                        pendingExportBytes = null
                                        bytes.fill(0)
                                        throw error
                                    }
                                } catch (error: Exception) {
                                    onReportActionError(error)
                                } finally {
                                    password.fill('\u0000')
                                }
                            }
                        }
                    }
                }) { Text("Choose file") }
            },
            dismissButton = {
                TextButton(onClick = {
                    showExportPasswordDialog = false
                    exportPassword = ""
                    exportPasswordConfirmation = ""
                    backupPasswordError = null
                }) { Text("Cancel") }
            }
        )
    }
    restoreUri?.let { uri ->
        AlertDialog(
            onDismissRequest = {
                restoreUri = null
                restorePassword = ""
                backupPasswordError = null
            },
            title = { Text("Unlock backup") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Enter the password used when this backup was created.")
                    OutlinedTextField(
                        value = restorePassword,
                        onValueChange = { restorePassword = it; backupPasswordError = null },
                        label = { Text("Backup password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                    backupPasswordError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val password = restorePassword.toCharArray()
                    restorePassword = ""
                    backupPasswordError = null
                    coroutineScope.launch {
                        var bytes: ByteArray? = null
                        try {
                            bytes = withContext(Dispatchers.IO) {
                                val input = context.contentResolver.openInputStream(uri)
                                    ?: throw IllegalStateException("Could not open the selected backup file.")
                                input.use(::readBackupFile)
                            }
                            backupPreview = onPreviewRestoreBackup(bytes, password)
                        } catch (error: Exception) {
                            onReportActionError(error)
                        } finally {
                            bytes?.fill(0)
                            password.fill('\u0000')
                            restoreUri = null
                        }
                    }
                }) { Text("Preview restore") }
            },
            dismissButton = {
                TextButton(onClick = {
                    restoreUri = null
                    restorePassword = ""
                    backupPasswordError = null
                }) { Text("Cancel") }
            }
        )
    }
    backupPreview?.let { preview ->
        AlertDialog(
            onDismissRequest = {
                backupPreview = null
                onCancelBackupRestore()
            },
            title = { Text("Replace app data?") },
            text = {
                Text(
                    "This backup contains ${preview.playlistCount} playlists, ${preview.favoriteCount} favorites, and ${preview.libraryCount} library items. " +
                        "Restoring replaces the current playlists, favorites, library, and backed-up preferences. Cached catalogs and guide data will be cleared."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    coroutineScope.launch {
                        try {
                            onDisplaySettingsRestored(onRestoreBackup())
                            backupPreview = null
                        } catch (error: Exception) {
                            onReportActionError(error)
                        }
                    }
                }) { Text("Restore and replace") }
            },
            dismissButton = {
                TextButton(onClick = {
                    backupPreview = null
                    onCancelBackupRestore()
                }) { Text("Cancel") }
            }
        )
    }
    legalInfo?.let { info ->
        AlertDialog(
            onDismissRequest = { legalInfo = null },
            title = { Text(info.title) },
            text = {
                Column(
                    Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState())
                ) {
                    Text(info.body)
                }
            },
            confirmButton = {
                TextButton(onClick = { legalInfo = null }) { Text("Close") }
            }
        )
    }
    if (showPlaylistEditor || editingPlaylist != null) {
        PlaylistEditor(
            playlist = editingPlaylist,
            onDismiss = {
                showPlaylistEditor = false
                editingPlaylist = null
            },
            onSave = {
                onAddPlaylist(it)
                showPlaylistEditor = false
                editingPlaylist = null
            }
        )
    }
    if (confirmResetFavorites) {
        AlertDialog(
            onDismissRequest = { confirmResetFavorites = false },
            title = { Text("Reset all favorites?") },
            text = { Text("This removes all $liveFavoriteCount live channel favorites. Saved movies and series are kept in your Library.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onResetFavorites()
                        confirmResetFavorites = false
                    }
                ) { Text("Reset favorites") }
            },
            dismissButton = {
                TextButton(onClick = { confirmResetFavorites = false }) { Text("Cancel") }
            }
        )
    }
}

private enum class LegalInfo(val title: String, val body: String) {
    CONTENT_AND_RIGHTS(
        "Content and rights",
        "TiviHub is a media player and playlist manager. It does not provide, sell, host, or bundle TV channels, movies, series, or TV guide listings. You add sources you choose, such as M3U or Xtream playlists; guide listings are read from the active playlist when available.\n\nOnly add sources and access details you are authorized to use. You are responsible for complying with applicable laws and your providers' terms. TiviHub does not verify, endorse, or control third-party sources; their content, availability, and accuracy are the responsibility of those providers."
    ),
    PRIVACY(
        "Privacy information",
        "Playlist details, cached catalogs and guide listings, favorites, and viewing status are stored locally on this device. Xtream usernames and passwords and an optional OpenSubtitles API key are encrypted using Android Keystore. Other saved data, including server URLs, is kept in app-private storage but is not encrypted by the app. Downloaded external subtitles are temporary app-cache files. Android app-data backup is disabled.\n\nYou can create a password-encrypted backup file containing playlists and credentials, favorites, library items, preferences, and the optional OpenSubtitles API key. TiviHub saves the encrypted file only to the destination you choose and does not upload it. Anyone with the file and password can access its contents; forgotten backup passwords cannot be recovered. Restoring replaces the current playlists, favorites, library, and included preferences, and clears cached catalogs and guide data.\n\nWhen you use a playlist, TiviHub sends requests to the configured playlist server and to media or image endpoints referenced by it. HTTP sources are unencrypted; the app warns and requires confirmation before saving an HTTP playlist URL. When you search OpenSubtitles, the title you enter and your API key are sent to OpenSubtitles; a selected subtitle file is downloaded from its supplied download link. Those providers may receive connection and request data and process it under their own privacy practices. This app build has no TiviHub account service or analytics SDK. The app does not control third-party server logging or retention.\n\nThis summary describes the app's current data behavior and is not legal advice."
    )
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun PlaylistEditor(playlist: Playlist?, onDismiss: () -> Unit, onSave: (Playlist) -> Unit) {
    var name by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.name.orEmpty()) }
    var url by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.url.orEmpty()) }
    var username by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.username.orEmpty()) }
    var password by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.password.orEmpty()) }
    var drmUrl by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.drmLicenseUrl.orEmpty()) }
    var type by rememberSaveable(playlist?.id) { mutableStateOf(playlist?.type ?: PlaylistType.M3U) }
    var expanded by remember { mutableStateOf(false) }
    var confirmInsecureUrl by remember { mutableStateOf(false) }
    var insecureUrlConfirmationAccepted by remember(url) { mutableStateOf(false) }
    val playlistToSave = {
        Playlist(
            id = playlist?.id ?: UUID.randomUUID().toString(),
            name = name.trim(),
            type = type,
            url = url.trim(),
            username = username.trim(),
            password = password,
            drmLicenseUrl = drmUrl.trim(),
            active = playlist?.active ?: false,
            createdAt = playlist?.createdAt ?: System.currentTimeMillis()
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (playlist == null) "Add playlist" else "Edit playlist") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true)
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = type.name,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Type") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        PlaylistType.entries.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.name) },
                                onClick = {
                                    type = item
                                    expanded = false
                                }
                            )
                        }
                    }
                }
                OutlinedTextField(url, { url = it }, label = { Text("Server or playlist URL") }, singleLine = true)
                if (url.trim().startsWith("http://", ignoreCase = true)) {
                    Text(
                        "This HTTP connection is not encrypted. Your provider may be able to see playlist credentials, viewing requests, and stream traffic.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
                if (type == PlaylistType.XTREAM) {
                    OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true)
                    OutlinedTextField(
                        password,
                        { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation()
                    )
                    OutlinedTextField(drmUrl, { drmUrl = it }, label = { Text("Optional Widevine license URL") }, singleLine = true)
                }
                if (type == PlaylistType.XTREAM) {
                    Text(
                        playlist?.expiresAtMillis?.let { "Account expiry: ${formatExpiryDate(it)}" }
                            ?: "Account expiry is fetched from Xtream when you save.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text("For Android DRM playback, use your provider’s Widevine license URL. FairPlay is Apple-only.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(onClick = {
                if (url.trim().startsWith("http://", ignoreCase = true) &&
                    !insecureUrlConfirmationAccepted
                ) {
                    confirmInsecureUrl = true
                } else {
                    onSave(playlistToSave())
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
    if (confirmInsecureUrl) {
        AlertDialog(
            onDismissRequest = { confirmInsecureUrl = false },
            title = { Text("Use an insecure HTTP playlist?") },
            text = {
                Text(
                    "This provider does not encrypt the connection. Other parties on the network may be able to read or alter your credentials, playlist data, and video traffic. Use HTTPS if your provider supports it. Continue only if you trust this provider and accept the risk."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        insecureUrlConfirmationAccepted = true
                        confirmInsecureUrl = false
                        onSave(playlistToSave())
                    }
                ) { Text("Continue with HTTP") }
            },
            dismissButton = {
                TextButton(onClick = { confirmInsecureUrl = false }) { Text("Cancel") }
            }
        )
    }
}

private fun formatExpiryDate(millis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(millis))

private fun formatFetchDateTime(millis: Long?): String =
    millis?.let {
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(it))
    } ?: "Never"

@Composable
private fun PosterCard(
    title: String,
    artwork: String?,
    inLibrary: Boolean,
    onClick: () -> Unit,
    onToggleLibrary: () -> Unit
) {
    Card(
        modifier = Modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column {
            Box {
                Artwork(artwork, Modifier.fillMaxWidth().aspectRatio(2f / 3f), title)
                IconButton(
                    onClick = onToggleLibrary,
                    modifier = Modifier.align(Alignment.TopEnd)
                ) {
                    Icon(
                        if (inLibrary) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                        contentDescription = if (inLibrary) "Remove $title from library" else "Add $title to library",
                        tint = if (inLibrary) MaterialTheme.colorScheme.primary else Color.White
                    )
                }
            }
            Box(
                Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 10.dp, vertical = 8.dp),
                contentAlignment = Alignment.TopStart
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

private fun readBackupFile(input: InputStream): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    var totalBytes = 0
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        totalBytes += count
        require(totalBytes <= TiviHubBackupFile.MAX_FILE_SIZE) { "Backup file is too large." }
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

private fun isInLibrary(
    contentId: String,
    contentType: ContentType,
    playlistId: String?,
    favorites: List<Favorite>,
    libraryItems: List<LibraryItem>
): Boolean {
    if (playlistId == null) return false
    return libraryItems.any {
        it.contentId == contentId && it.contentType == contentType && it.playlistId == playlistId
    } || favorites.any {
        it.contentId == contentId && it.contentType == contentType && it.playlistId == playlistId
    }
}

@Composable
private fun DetailHero(url: String?, title: String) {
    Box(Modifier.fillMaxWidth().height(380.dp).clip(RoundedCornerShape(16.dp))) {
        if (url.isNullOrBlank()) {
            Box(
                Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Tv, contentDescription = title, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            AsyncImage(
                model = url,
                contentDescription = title,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                alignment = Alignment.TopCenter,
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)
            )
        }
        Box(
            Modifier.fillMaxSize().background(
                androidx.compose.ui.graphics.Brush.verticalGradient(
                    0.45f to Color.Transparent,
                    1f to Color.Black.copy(alpha = 0.92f)
                )
            )
        )
        Text(
            title,
            Modifier.align(Alignment.BottomStart).padding(16.dp),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            maxLines = 3
        )
    }
}

@Composable
private fun Artwork(url: String?, modifier: Modifier = Modifier, description: String) {
    if (url.isNullOrBlank()) {
        Box(
            modifier.background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Tv, contentDescription = description, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } else {
        AsyncImage(
            model = url,
            contentDescription = description,
            modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant)
        )
    }
}

@Composable
private fun EmptyState(title: String, message: String) {
    Column(
        Modifier.fillMaxWidth().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
