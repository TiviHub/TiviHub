package com.tivihub

import android.app.Application
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tivihub.data.local.BackupPreferences
import com.tivihub.data.local.BackupDisplaySettings
import com.tivihub.data.local.BackupSummary
import com.tivihub.data.local.LocalRepository
import com.tivihub.data.local.CredentialCipher
import com.tivihub.data.local.TiviHubBackup
import com.tivihub.data.local.TiviHubBackupFile
import com.tivihub.data.model.EpgProgram
import com.tivihub.data.model.Favorite
import com.tivihub.data.model.LibraryItem
import com.tivihub.data.model.LibraryStatus
import com.tivihub.data.model.Episode
import com.tivihub.data.model.LiveChannel
import com.tivihub.data.model.Movie
import com.tivihub.data.model.Playlist
import com.tivihub.data.model.PlaylistType
import com.tivihub.data.model.Series
import com.tivihub.data.network.JsonArrayReader
import com.tivihub.data.network.XtreamApi
import java.io.Reader
import java.io.Writer
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

enum class AppSection(val label: String) {
    LIVE("Live"), MOVIES("Movies"), SERIES("Series"), LIBRARY("Library"), SETTINGS("Settings")
}

enum class CatalogRefreshInterval(val label: String, val intervalMillis: Long?) {
    STARTUP("On startup", null),
    DAILY("Once per day", 24 * 60 * 60 * 1000L),
    EVERY_THREE_DAYS("Every 3 days", 3 * 24 * 60 * 60 * 1000L),
    WEEKLY("Every 7 days", 7 * 24 * 60 * 60 * 1000L)
}

data class PlaylistRefreshState(
    val inProgress: Boolean = false,
    val lastAttemptAt: Long? = null,
    val errorMessage: String? = null
)

class MainViewModel(
    application: Application,
    private val repository: LocalRepository,
    private val api: XtreamApi
) : AndroidViewModel(application) {
    val playlists = repository.playlists.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val favorites = repository.favorites.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val libraryItems = repository.libraryItems.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val liveGuidePrograms = repository.guidePrograms(
        System.currentTimeMillis() - 2 * 60 * 60 * 1000L,
        System.currentTimeMillis() + 24 * 60 * 60 * 1000L
    ).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _activePlaylist = MutableStateFlow<Playlist?>(null)
    val activePlaylist: StateFlow<Playlist?> = _activePlaylist.asStateFlow()
    private val _section = MutableStateFlow(AppSection.LIVE)
    val section: StateFlow<AppSection> = _section.asStateFlow()
    private val _channels = MutableStateFlow<List<LiveChannel>>(emptyList())
    val channels: StateFlow<List<LiveChannel>> = _channels.asStateFlow()
    private val _movies = MutableStateFlow<List<Movie>>(emptyList())
    val movies: StateFlow<List<Movie>> = _movies.asStateFlow()
    private val _series = MutableStateFlow<List<Series>>(emptyList())
    val series: StateFlow<List<Series>> = _series.asStateFlow()
    private val _episodes = MutableStateFlow<List<Episode>>(emptyList())
    val episodes: StateFlow<List<Episode>> = _episodes.asStateFlow()
    private val _guidePrograms = MutableStateFlow<List<EpgProgram>>(emptyList())
    val guidePrograms: StateFlow<List<EpgProgram>> = _guidePrograms.asStateFlow()
    private val _selectedSeries = MutableStateFlow<Series?>(null)
    val selectedSeries: StateFlow<Series?> = _selectedSeries.asStateFlow()
    private val _selectedMovie = MutableStateFlow<Movie?>(null)
    val selectedMovie: StateFlow<Movie?> = _selectedMovie.asStateFlow()
    private val _selectedChannel = MutableStateFlow<LiveChannel?>(null)
    val selectedChannel: StateFlow<LiveChannel?> = _selectedChannel.asStateFlow()
    private val _channelGuidePrograms = MutableStateFlow<List<EpgProgram>>(emptyList())
    val channelGuidePrograms: StateFlow<List<EpgProgram>> = _channelGuidePrograms.asStateFlow()
    private val _catalogRefreshTimes = MutableStateFlow<Map<String, Map<String, Long>>>(emptyMap())
    val catalogRefreshTimes: StateFlow<Map<String, Map<String, Long>>> = _catalogRefreshTimes.asStateFlow()
    private val _catalogRefreshInProgress = MutableStateFlow(false)
    val catalogRefreshInProgress: StateFlow<Boolean> = _catalogRefreshInProgress.asStateFlow()
    private val _playlistRefreshStates = MutableStateFlow<Map<String, PlaylistRefreshState>>(emptyMap())
    val playlistRefreshStates: StateFlow<Map<String, PlaylistRefreshState>> =
        _playlistRefreshStates.asStateFlow()
    private val epgPreferences = application.getSharedPreferences(PREFERENCES, 0)
    private val subtitlePreferences = application.getSharedPreferences(PREFERENCES, 0)
    private val appPreferences = application.getSharedPreferences(PREFERENCES, 0)
    private val credentialCipher = CredentialCipher("tivihub.opensubtitles.api_key")
    private var pendingRestoreBackup: TiviHubBackup? = null
    private val _openSubtitlesConfigured = MutableStateFlow(
        !subtitlePreferences.getString(OPEN_SUBTITLES_API_KEY, null).isNullOrBlank()
    )
    val openSubtitlesConfigured: StateFlow<Boolean> = _openSubtitlesConfigured.asStateFlow()
    private val _epgLastFetched = MutableStateFlow(
        epgPreferences.getLong(EPG_LAST_FETCHED, 0L).takeIf { it > 0L }
    )
    val epgLastFetched: StateFlow<Long?> = _epgLastFetched.asStateFlow()
    private val _epgRefreshInProgress = MutableStateFlow(false)
    val epgRefreshInProgress: StateFlow<Boolean> = _epgRefreshInProgress.asStateFlow()
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    private val feedbackMessages = Channel<String>(Channel.CONFLATED)
    val feedback = feedbackMessages.receiveAsFlow()
    private val _playerItem = MutableStateFlow<PlayerItem?>(null)
    val playerItem: StateFlow<PlayerItem?> = _playerItem.asStateFlow()
    private var guideJob: Job? = null
    private var channelGuideJob: Job? = null
    private val sessionCatalogRefreshes = mutableSetOf<String>()
    private val inFlightCatalogs = mutableSetOf<String>()
    private val manualCatalogRefreshes = mutableSetOf<String>()
    private val catalogRefreshMutex = Mutex()

    init {
        viewModelScope.launch {
            try {
                _activePlaylist.value = repository.activePlaylist()
                loadCatalogRefreshTimes()
                _activePlaylist.value?.let { playlist ->
                    loadLive(playlist)
                    if (playlist.type == PlaylistType.XTREAM &&
                        catalogRefreshInterval() == CatalogRefreshInterval.STARTUP
                    ) {
                        loadMovies(playlist)
                        loadSeries(playlist)
                    }
                }
                if (_activePlaylist.value?.type == PlaylistType.XTREAM &&
                    autoRefreshEnabled() &&
                    shouldRefreshEpg()
                ) {
                    refreshGuide(showConfirmation = false)
                }
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun selectSection(section: AppSection) {
        _section.value = section
        if (section == AppSection.SETTINGS) loadCatalogRefreshTimes()
        val playlist = _activePlaylist.value ?: return
        when (section) {
            AppSection.LIVE -> loadLive(playlist)
            AppSection.MOVIES -> if (playlist.type == PlaylistType.XTREAM) loadMovies(playlist)
            AppSection.SERIES -> if (playlist.type == PlaylistType.XTREAM) loadSeries(playlist)
            AppSection.LIBRARY -> Unit
            AppSection.SETTINGS -> Unit
        }
    }

    private fun loadCatalogRefreshTimes() {
        viewModelScope.launch {
            try {
                _catalogRefreshTimes.value = repository.allPlaylists().associate { playlist ->
                    playlist.id to repository.catalogRefreshTimes(playlist.id)
                }
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun catalogRefreshInterval(): CatalogRefreshInterval {
        val stored = getApplication<Application>()
            .getSharedPreferences(PREFERENCES, 0)
            .getString(CATALOG_REFRESH_INTERVAL, CatalogRefreshInterval.DAILY.name)
        return CatalogRefreshInterval.entries.firstOrNull { it.name == stored }
            ?: CatalogRefreshInterval.DAILY
    }

    fun setCatalogRefreshInterval(interval: CatalogRefreshInterval) {
        getApplication<Application>().getSharedPreferences(PREFERENCES, 0).edit {
            putString(CATALOG_REFRESH_INTERVAL, interval.name)
        }
        showFeedback("Catalog refresh interval updated")
    }

    fun savePlaylist(playlist: Playlist) {
        viewModelScope.launch {
            try {
                val isUpdate = repository.allPlaylists().any { it.id == playlist.id }
                val providerExpiry = validatePlaylist(playlist)
                repository.savePlaylist(
                    playlist.copy(expiresAtMillis = providerExpiry)
                )
                val current = _activePlaylist.value
                if (current == null || playlist.active) {
                    repository.setActivePlaylist(playlist.id)
                    _activePlaylist.value = repository.activePlaylist()
                    _channels.value = emptyList()
                    _movies.value = emptyList()
                    _series.value = emptyList()
                }
                showFeedback(if (isUpdate) "Playlist updated" else "Playlist added")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun activatePlaylist(playlist: Playlist) {
        viewModelScope.launch {
            try {
                repository.setActivePlaylist(playlist.id)
                _activePlaylist.value = repository.activePlaylist()
                _channels.value = emptyList()
                _movies.value = emptyList()
                _series.value = emptyList()
                _activePlaylist.value?.let(::loadLive)
                showFeedback("Active playlist changed")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun deletePlaylist(playlist: Playlist) {
        viewModelScope.launch {
            try {
                val wasActive = _activePlaylist.value?.id == playlist.id
                repository.deletePlaylist(playlist.id)
                if (wasActive) {
                    val next = repository.allPlaylists().firstOrNull()
                    if (next != null) repository.setActivePlaylist(next.id)
                    _activePlaylist.value = repository.activePlaylist()
                    _channels.value = emptyList()
                    _movies.value = emptyList()
                    _series.value = emptyList()
                    _activePlaylist.value?.let { loadLive(it) }
                }
                showFeedback("Playlist deleted")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun loadLive(playlist: Playlist? = _activePlaylist.value) {
        val current = playlist ?: return
        loadCatalog(current, "live", ::decodeLive, ::encodeLive, false, api::liveChannels) {
            _channels.value = it
        }
    }

    fun loadMovies(playlist: Playlist? = _activePlaylist.value) {
        val current = playlist ?: return
        loadCatalog(current, "movies", ::decodeMovies, ::encodeMovie, false, api::movies, cacheVersion = 2) {
            _movies.value = it
        }
    }

    fun loadSeries(playlist: Playlist? = _activePlaylist.value) {
        val current = playlist ?: return
        loadCatalog(current, "series", ::decodeSeries, ::encodeSeries, false, api::series, cacheVersion = 2) {
            _series.value = it
        }
    }

    fun refreshCatalogs() {
        val playlist = _activePlaylist.value ?: return showError(
            IllegalStateException("Choose an active playlist first.")
        )
        refreshPlaylist(playlist)
    }

    fun refreshPlaylist(playlist: Playlist) {
        if (_playlistRefreshStates.value[playlist.id]?.inProgress == true) return
        _playlistRefreshStates.value = _playlistRefreshStates.value + (
            playlist.id to PlaylistRefreshState(inProgress = true)
        )
        _catalogRefreshInProgress.value = true
        viewModelScope.launch {
            val errors = mutableListOf<String>()
            try {
                val refreshActions = buildList<suspend () -> Unit> {
                    add {
                        refreshCatalogNow(playlist, "live", ::encodeLive, api::liveChannels, publish = {
                            if (_activePlaylist.value?.id == playlist.id) _channels.value = it
                        })
                    }
                    if (playlist.type == PlaylistType.XTREAM) {
                        add {
                            refreshCatalogNow(
                                playlist, "movies", ::encodeMovie, api::movies, cacheVersion = 2,
                                publish = { if (_activePlaylist.value?.id == playlist.id) _movies.value = it }
                            )
                        }
                        add {
                            refreshCatalogNow(
                                playlist, "series", ::encodeSeries, api::series, cacheVersion = 2,
                                publish = { if (_activePlaylist.value?.id == playlist.id) _series.value = it }
                            )
                        }
                    }
                }
                refreshActions.forEach { refresh ->
                    try {
                        refresh()
                    } catch (error: Exception) {
                        errors += actionableRefreshError(playlist, error)
                    }
                }
            } finally {
                val completedAt = System.currentTimeMillis()
                val errorMessage = errors.distinct().joinToString("\n").takeIf(String::isNotBlank)
                _playlistRefreshStates.value = _playlistRefreshStates.value + (
                    playlist.id to PlaylistRefreshState(
                        inProgress = false,
                        lastAttemptAt = completedAt,
                        errorMessage = errorMessage
                    )
                )
                _catalogRefreshInProgress.value = _playlistRefreshStates.value.values.any { it.inProgress }
                if (errorMessage == null) {
                    showFeedback("${playlist.name} refreshed")
                } else {
                    showFeedback("${playlist.name}: refresh failed. See playlist details for recovery steps.")
                }
            }
        }
    }

    private suspend fun <T> refreshCatalogNow(
        playlist: Playlist,
        contentType: String,
        encodeItem: (T) -> JSONObject,
        fetch: suspend (Playlist) -> List<T>,
        cacheVersion: Int = 0,
        publish: (List<T>) -> Unit
    ) {
        catalogRefreshMutex.withLock {
            val fresh = fetch(playlist)
            val refreshedAt = System.currentTimeMillis()
            repository.saveCatalog(playlist.id, contentType, refreshedAt, cacheVersion) { writer ->
                writeCatalog(writer, fresh, encodeItem)
            }
            _catalogRefreshTimes.value = _catalogRefreshTimes.value +
                (playlist.id to (_catalogRefreshTimes.value[playlist.id].orEmpty() + (contentType to refreshedAt)))
            publish(fresh)
        }
    }

    private fun actionableRefreshError(playlist: Playlist, error: Exception): String {
        val causeMessages = mutableListOf<String>()
        val causes = mutableListOf<Throwable>()
        var cause: Throwable? = error
        while (cause != null) {
            causes += cause
            cause.message?.let(causeMessages::add)
            cause = cause.cause
        }
        val message = causeMessages.joinToString(" ").lowercase(java.util.Locale.ROOT)
        val connectionFailure = causes.any {
            it is java.net.UnknownHostException ||
                it is java.net.SocketTimeoutException ||
                it is java.net.ConnectException
        }
        return when {
            playlist.type == PlaylistType.XTREAM && (
                "authentication was rejected" in message ||
                    "unauthorized" in message ||
                    "http 401" in message ||
                    "http 403" in message ||
                    "expired" in message ||
                    "disabled" in message
                ) -> "Provider rejected the account or subscription. Edit the playlist credentials or contact your provider, then retry."
            "http 404" in message ->
                "Playlist endpoint was not found (HTTP 404). Edit the playlist URL and retry."
            "http 5" in message ||
                connectionFailure ->
                "Provider is unavailable or the connection failed. Check your internet connection and provider status, then retry."
            else -> {
                var safeMessage = error.localizedMessage ?: "Unexpected provider response."
                listOf(
                    playlist.url to "[playlist URL]",
                    playlist.username to "[username]",
                    playlist.password to "[password]"
                ).filter { it.first.isNotBlank() }.forEach { (secret, replacement) ->
                    safeMessage = safeMessage.replace(secret, replacement)
                }
                safeMessage = safeMessage.takeIf(String::isNotBlank) ?: "Unexpected provider response."
                "Refresh failed: $safeMessage Check the playlist settings and retry."
            }
        }
    }

    private fun <T> loadCatalog(
        playlist: Playlist,
        contentType: String,
        decode: (Reader) -> List<T>,
        encodeItem: (T) -> JSONObject,
        forceRefresh: Boolean,
        fetch: suspend (Playlist) -> List<T>,
        cacheVersion: Int = 0,
        publish: (List<T>) -> Unit
    ) {
        viewModelScope.launch {
            val refreshKey = "${playlist.id}:$contentType"
            if (!inFlightCatalogs.add(refreshKey)) return@launch
            if (forceRefresh) {
                manualCatalogRefreshes.add(refreshKey)
                _catalogRefreshInProgress.value = true
            }
            _loading.value = true
            try {
                catalogRefreshMutex.withLock {
                    val cached = if (forceRefresh) {
                        null
                    } else {
                        repository.cachedCatalog(playlist.id, contentType, decode, cacheVersion)
                    }
                    if (cached != null) publish(cached.first)
                    val interval = catalogRefreshInterval()
                    val shouldRefresh = when {
                        forceRefresh -> {
                            if (interval == CatalogRefreshInterval.STARTUP) {
                                sessionCatalogRefreshes.add(refreshKey)
                            }
                            true
                        }
                        cached == null -> {
                            if (interval == CatalogRefreshInterval.STARTUP) {
                                sessionCatalogRefreshes.add(refreshKey)
                            }
                            true
                        }
                        interval == CatalogRefreshInterval.STARTUP -> sessionCatalogRefreshes.add(refreshKey)
                        else -> interval.intervalMillis?.let {
                            System.currentTimeMillis() - cached.second >= it
                        } ?: false
                    }
                    if (shouldRefresh) {
                        val fresh = fetch(playlist)
                        val refreshedAt = System.currentTimeMillis()
                        repository.saveCatalog(
                            playlist.id,
                            contentType,
                            refreshedAt,
                            cacheVersion
                        ) { writer ->
                            writeCatalog(writer, fresh, encodeItem)
                        }
                        _catalogRefreshTimes.value = _catalogRefreshTimes.value +
                            (playlist.id to (_catalogRefreshTimes.value[playlist.id].orEmpty() + (contentType to refreshedAt)))
                        publish(fresh)
                    }
                }
            } catch (error: Exception) {
                showError(error)
            } finally {
                inFlightCatalogs.remove(refreshKey)
                if (forceRefresh) {
                    manualCatalogRefreshes.remove(refreshKey)
                    _catalogRefreshInProgress.value = manualCatalogRefreshes.isNotEmpty()
                }
                _loading.value = false
            }
        }
    }

    fun openSeries(series: Series) {
        _selectedSeries.value = series
        _episodes.value = emptyList()
        val playlist = _activePlaylist.value ?: return showError(IllegalStateException("Choose an active playlist first."))
        load { _episodes.value = api.episodes(playlist, series) }
    }

    fun openMovie(movie: Movie) {
        _selectedMovie.value = movie
        val playlist = _activePlaylist.value ?: return showError(IllegalStateException("Choose an active playlist first."))
        load {
            val detailed = api.movieDetails(playlist, movie)
            _selectedMovie.value = detailed
            _movies.value = _movies.value.map { if (it.id == detailed.id) detailed else it }
        }
    }

    fun closeMovie() {
        _selectedMovie.value = null
    }

    fun openChannel(channel: LiveChannel) {
        _selectedChannel.value = channel
        _channelGuidePrograms.value = emptyList()
        channelGuideJob?.cancel()
        val guideId = channel.tvgId?.takeIf(String::isNotBlank) ?: return
        val now = System.currentTimeMillis()
        channelGuideJob = viewModelScope.launch {
            repository.programs(guideId, now - 2 * 60 * 60 * 1000L, now + 24 * 60 * 60 * 1000L)
                .collect { _channelGuidePrograms.value = it }
        }
    }

    fun closeChannel() {
        _selectedChannel.value = null
        _channelGuidePrograms.value = emptyList()
        channelGuideJob?.cancel()
        channelGuideJob = null
    }

    fun closeSeries() {
        _selectedSeries.value = null
        _episodes.value = emptyList()
    }

    fun play(
        url: String,
        title: String,
        drmLicenseUrl: String? = null,
        channelId: String? = null,
        libraryItem: LibraryItem? = null,
        subtitleSearchQuery: String? = null,
        isLive: Boolean = false
    ) {
        val previous = libraryItem?.let { item ->
            libraryItems.value.firstOrNull {
                it.contentId == item.contentId &&
                    it.contentType == item.contentType &&
                    it.playlistId == item.playlistId
            }
        }
        val resumePosition = previous?.takeIf {
            it.status == LibraryStatus.WATCHING && it.positionMillis < it.durationMillis
        }?.positionMillis ?: 0L
        _playerItem.value = PlayerItem(
            url,
            title,
            drmLicenseUrl,
            channelId,
            libraryItem,
            resumePosition,
            subtitleSearchQuery,
            isLive
        )
        libraryItem?.let { item ->
            viewModelScope.launch {
                try {
                    repository.saveLibraryItem(
                        item.copy(
                            status = LibraryStatus.WATCHING,
                            positionMillis = resumePosition,
                            updatedAt = System.currentTimeMillis()
                        )
                    )
                } catch (error: Exception) {
                    showError(error)
                }
            }
        }
        guideJob?.cancel()
        _guidePrograms.value = emptyList()
        if (channelId != null) {
            val start = System.currentTimeMillis() - 60 * 60 * 1000
            val end = System.currentTimeMillis() + 12 * 60 * 60 * 1000
            guideJob = viewModelScope.launch {
                repository.programs(channelId, start, end).collect { _guidePrograms.value = it }
            }
        }
    }

    fun closePlayer() {
        _playerItem.value = null
        guideJob?.cancel()
        _guidePrograms.value = emptyList()
    }

    fun updatePlaybackProgress(
        positionMillis: Long,
        durationMillis: Long,
        ended: Boolean,
        trackedItem: LibraryItem? = _playerItem.value?.libraryItem
    ) {
        val item = trackedItem ?: return
        if (durationMillis <= 0L || positionMillis < 0L) return
        viewModelScope.launch {
            try {
                val watched = ended || positionMillis >= durationMillis * 0.9
                repository.saveLibraryItem(
                    item.copy(
                        status = if (watched) LibraryStatus.WATCHED else LibraryStatus.WATCHING,
                        positionMillis = if (watched) durationMillis else positionMillis,
                        durationMillis = durationMillis,
                        updatedAt = System.currentTimeMillis()
                    )
                )
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun toggleLibrary(item: LibraryItem) {
        viewModelScope.launch {
            try {
                val existing = repository.findLibraryItem(item.contentId, item.contentType, item.playlistId)
                val legacyFavorite = favorites.value.firstOrNull {
                    it.contentId == item.contentId &&
                        it.contentType == item.contentType &&
                        it.playlistId == item.playlistId
                }
                if (existing != null || legacyFavorite != null) {
                    if (existing != null) repository.removeLibraryItem(existing)
                    if (legacyFavorite != null) repository.removeFavorite(legacyFavorite)
                    showFeedback("Removed from library")
                } else {
                    repository.saveLibraryItem(
                        item.copy(
                            status = LibraryStatus.WATCHLIST,
                            positionMillis = 0,
                            durationMillis = 0,
                            updatedAt = System.currentTimeMillis()
                        )
                    )
                    showFeedback("Saved to library")
                }
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun setLibraryStatus(item: LibraryItem, status: LibraryStatus) {
        viewModelScope.launch {
            try {
                repository.saveLibraryItem(item.copy(status = status, updatedAt = System.currentTimeMillis()))
                showFeedback(
                    when (status) {
                        LibraryStatus.WATCHLIST -> "Saved to library"
                        LibraryStatus.WATCHING -> "Marked as watching"
                        LibraryStatus.WATCHED -> "Marked as watched"
                    }
                )
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun removeFromWatchlist(item: LibraryItem) {
        viewModelScope.launch {
            try {
                repository.removeLibraryItem(item)
                val favorite = favorites.value.firstOrNull {
                    it.contentId == item.contentId &&
                        it.contentType == item.contentType &&
                        it.playlistId == item.playlistId
                }
                if (favorite != null) repository.removeFavorite(favorite)
                showFeedback("Removed from library")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun openLibraryItem(item: LibraryItem) {
        if (!item.streamUrl.isNullOrBlank()) {
            play(item.streamUrl, item.title, libraryItem = item)
        } else if (item.contentType == com.tivihub.data.model.ContentType.SERIES) {
            load {
                val playlist = _activePlaylist.value
                    ?: throw IllegalStateException("Choose an active playlist first.")
                val selected = _series.value.firstOrNull { it.id == item.contentId }
                    ?: api.series(playlist).firstOrNull { it.id == item.contentId }
                    ?: throw IllegalStateException("This series is no longer available in the active playlist.")
                openSeries(selected)
            }
        }
    }

    fun openLibraryDetails(item: LibraryItem) {
        when (item.contentType) {
            com.tivihub.data.model.ContentType.MOVIE -> {
                val movie = _movies.value.firstOrNull { it.id == item.contentId } ?: Movie(
                    id = item.contentId,
                    name = item.title,
                    streamUrl = item.streamUrl.orEmpty(),
                    posterUrl = item.artworkUrl
                )
                openMovie(movie)
            }
            com.tivihub.data.model.ContentType.SERIES -> {
                val series = _series.value.firstOrNull { it.id == item.contentId } ?: Series(
                    id = item.contentId,
                    name = item.title,
                    posterUrl = item.artworkUrl
                )
                openSeries(series)
            }
            else -> openLibraryItem(item)
        }
    }

    fun toggleFavorite(favorite: Favorite) {
        viewModelScope.launch {
            try {
                val existing = favorites.value.firstOrNull {
                    it.contentId == favorite.contentId &&
                        it.contentType == favorite.contentType &&
                        it.playlistId == favorite.playlistId
                }
                if (existing == null) {
                    repository.addFavorite(favorite)
                    showFeedback("Added to favorites")
                } else {
                    repository.removeFavorite(existing)
                    showFeedback("Removed from favorites")
                }
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun resetFavorites() {
        viewModelScope.launch {
            try {
                repository.removeLiveFavorites()
                showFeedback("Favorites reset")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun refreshGuide(showConfirmation: Boolean = true) {
        if (_epgRefreshInProgress.value) return
        _epgRefreshInProgress.value = true
        viewModelScope.launch {
            try {
                val playlist = _activePlaylist.value
                    ?: throw IllegalStateException("Choose an active playlist before refreshing EPG.")
                require(playlist.type == PlaylistType.XTREAM) {
                    "Playlist EPG refresh currently requires an Xtream playlist."
                }
                val now = System.currentTimeMillis()
                val programs = api.epg(playlist, now - 2 * 60 * 60 * 1000L, now + 24 * 60 * 60 * 1000L)
                repository.replacePrograms(programs)
                val refreshedAt = System.currentTimeMillis()
                epgPreferences.edit { putLong(EPG_LAST_FETCHED, refreshedAt) }
                _epgLastFetched.value = refreshedAt
                if (showConfirmation) showFeedback("TV guide refreshed")
            } catch (error: Exception) {
                showError(error)
            } finally {
                _epgRefreshInProgress.value = false
            }
        }
    }

    fun clearGuideCache() {
        viewModelScope.launch {
            try {
                repository.clearGuideCache()
                epgPreferences.edit { remove(EPG_LAST_FETCHED) }
                _epgLastFetched.value = null
                showFeedback("TV guide cache cleared")
            } catch (error: Exception) {
                showError(error)
            }
        }
    }

    fun setAutoRefresh(enabled: Boolean) {
        getApplication<Application>().getSharedPreferences(PREFERENCES, 0).edit {
            putBoolean(AUTO_REFRESH, enabled)
        }
        showFeedback(if (enabled) "Automatic guide refresh enabled" else "Automatic guide refresh disabled")
        if (enabled && shouldRefreshEpg()) refreshGuide()
    }

    fun epgRefreshInterval(): CatalogRefreshInterval {
        val stored = epgPreferences.getString(EPG_REFRESH_INTERVAL, CatalogRefreshInterval.DAILY.name)
        return CatalogRefreshInterval.entries.firstOrNull { it.name == stored }
            ?: CatalogRefreshInterval.DAILY
    }

    fun setEpgRefreshInterval(interval: CatalogRefreshInterval) {
        epgPreferences.edit { putString(EPG_REFRESH_INTERVAL, interval.name) }
        showFeedback("TV guide refresh interval updated")
    }

    fun openSubtitlesApiKey(): String? =
        subtitlePreferences.getString(OPEN_SUBTITLES_API_KEY, null)
            ?.takeIf(String::isNotBlank)
            ?.let(credentialCipher::decrypt)

    fun setOpenSubtitlesApiKey(apiKey: String) {
        val normalized = apiKey.trim()
        subtitlePreferences.edit {
            if (normalized.isEmpty()) remove(OPEN_SUBTITLES_API_KEY)
            else putString(OPEN_SUBTITLES_API_KEY, credentialCipher.encrypt(normalized))
        }
        _openSubtitlesConfigured.value = normalized.isNotEmpty()
        showFeedback(if (normalized.isEmpty()) "OpenSubtitles API key removed" else "OpenSubtitles API key saved")
    }

    suspend fun createEncryptedBackup(password: CharArray): ByteArray {
        val snapshot = repository.userDataSnapshot()
        val backup = TiviHubBackup(
            playlists = snapshot.playlists,
            favorites = snapshot.favorites,
            libraryItems = snapshot.libraryItems,
            preferences = BackupPreferences(
                theme = appPreferences.getString(THEME, "system") ?: "system",
                catalogColumns = catalogColumns(),
                autoRefresh = autoRefreshEnabled(),
                catalogRefreshInterval = catalogRefreshInterval().name,
                epgRefreshInterval = epgRefreshInterval().name,
                openSubtitlesApiKey = openSubtitlesApiKey().orEmpty()
            )
        )
        return withContext(Dispatchers.Default) {
            TiviHubBackupFile.encrypt(backup, password)
        }
    }

    suspend fun previewRestoreBackup(file: ByteArray, password: CharArray): BackupSummary {
        val backup = withContext(Dispatchers.Default) {
            TiviHubBackupFile.decrypt(file, password)
        }
        require(backup.preferences.theme in setOf("system", "light", "dark")) {
            "The backup contains an invalid theme setting."
        }
        require(backup.preferences.catalogColumns in setOf(0, 2, 3, 4)) {
            "The backup contains an invalid catalog layout setting."
        }
        require(CatalogRefreshInterval.entries.any { it.name == backup.preferences.catalogRefreshInterval }) {
            "The backup contains an invalid catalog refresh setting."
        }
        require(CatalogRefreshInterval.entries.any { it.name == backup.preferences.epgRefreshInterval }) {
            "The backup contains an invalid guide refresh setting."
        }
        require(backup.playlists.all { it.id.isNotBlank() && it.name.isNotBlank() && it.url.isNotBlank() }) {
            "The backup contains an invalid playlist."
        }
        require(backup.playlists.all { playlist ->
            isValidHttpUrl(playlist.url) &&
                (playlist.type != PlaylistType.XTREAM ||
                    (playlist.username.isNotBlank() && playlist.password.isNotBlank())) &&
                (playlist.drmLicenseUrl.isBlank() || isValidHttpUrl(playlist.drmLicenseUrl))
        }) { "The backup contains invalid playlist connection details." }
        pendingRestoreBackup = backup
        return BackupSummary(
            playlistCount = backup.playlists.size,
            favoriteCount = backup.favorites.size,
            libraryCount = backup.libraryItems.size
        )
    }

    suspend fun restorePendingBackup(): BackupDisplaySettings {
        val backup = checkNotNull(pendingRestoreBackup) { "No backup is ready to restore." }
        repository.replaceUserData(backup.playlists, backup.favorites, backup.libraryItems)
        appPreferences.edit {
            putString(THEME, backup.preferences.theme)
            putInt(CATALOG_COLUMNS, backup.preferences.catalogColumns)
            putBoolean(AUTO_REFRESH, backup.preferences.autoRefresh)
            putString(CATALOG_REFRESH_INTERVAL, backup.preferences.catalogRefreshInterval)
            putString(EPG_REFRESH_INTERVAL, backup.preferences.epgRefreshInterval)
            val encryptedApiKey = backup.preferences.openSubtitlesApiKey
                .takeIf(String::isNotBlank)
                ?.let(credentialCipher::encrypt)
            if (encryptedApiKey == null) remove(OPEN_SUBTITLES_API_KEY)
            else putString(OPEN_SUBTITLES_API_KEY, encryptedApiKey)
        }
        pendingRestoreBackup = null
        _activePlaylist.value = repository.activePlaylist()
        _channels.value = emptyList()
        _movies.value = emptyList()
        _series.value = emptyList()
        _selectedChannel.value = null
        _selectedMovie.value = null
        _selectedSeries.value = null
        _playerItem.value = null
        _guidePrograms.value = emptyList()
        _channelGuidePrograms.value = emptyList()
        guideJob?.cancel()
        channelGuideJob?.cancel()
        clearGuideFetchState()
        _openSubtitlesConfigured.value = backup.preferences.openSubtitlesApiKey.isNotBlank()
        loadCatalogRefreshTimes()
        _activePlaylist.value?.let(::loadLive)
        showFeedback("Backup restored")
        return BackupDisplaySettings(backup.preferences.theme, backup.preferences.catalogColumns)
    }

    fun catalogColumns(): Int =
        appPreferences.getInt(CATALOG_COLUMNS, 0).takeIf { it in setOf(0, 2, 3, 4) } ?: 0

    private fun clearGuideFetchState() {
        epgPreferences.edit { remove(EPG_LAST_FETCHED) }
        _epgLastFetched.value = null
    }

    fun cancelPendingBackupRestore() {
        pendingRestoreBackup = null
    }

    fun reportActionError(error: Exception) {
        showError(error)
    }

    private fun shouldRefreshEpg(): Boolean {
        val lastFetched = _epgLastFetched.value ?: return true
        val interval = epgRefreshInterval()
        return when (interval) {
            CatalogRefreshInterval.STARTUP -> true
            else -> interval.intervalMillis?.let {
                System.currentTimeMillis() - lastFetched >= it
            } ?: false
        }
    }

    fun autoRefreshEnabled() = getApplication<Application>()
        .getSharedPreferences(PREFERENCES, 0)
        .getBoolean(AUTO_REFRESH, true)

    private fun load(action: suspend () -> Unit) {
        viewModelScope.launch {
            _loading.value = true
            try {
                action()
            } catch (error: Exception) {
                showError(error)
            } finally {
                _loading.value = false
            }
        }
    }

    private suspend fun validatePlaylist(playlist: Playlist): Long? {
        require(playlist.name.isNotBlank()) { "Enter a playlist name." }
        requireHttpUrl(playlist.url)
        val providerExpiry = if (playlist.type == PlaylistType.XTREAM) {
            require(playlist.username.isNotBlank() && playlist.password.isNotBlank()) {
                "Enter the Xtream username and password."
            }
            api.authenticate(playlist)
        } else null
        if (playlist.drmLicenseUrl.isNotBlank()) requireHttpUrl(playlist.drmLicenseUrl)
        return providerExpiry
    }

    private fun requireHttpUrl(value: String) {
        require(isValidHttpUrl(value)) {
            "Enter a valid HTTP or HTTPS URL."
        }
    }

    private fun isValidHttpUrl(value: String): Boolean {
        val uri = try {
            java.net.URI(value)
        } catch (_: java.net.URISyntaxException) {
            return false
        }
        return uri.scheme in setOf("http", "https") && uri.host != null
    }

    private fun showError(error: Exception) {
        showFeedback(error.localizedMessage ?: "Something went wrong.")
    }

    fun notifyAction(message: String) {
        showFeedback(message)
    }

    private fun showFeedback(message: String) {
        check(feedbackMessages.trySend(message).isSuccess) {
            "Could not deliver action feedback."
        }
    }

    data class PlayerItem(
        val url: String,
        val title: String,
        val drmLicenseUrl: String?,
        val channelId: String?,
        val libraryItem: LibraryItem?,
        val resumePositionMillis: Long,
        val subtitleSearchQuery: String?,
        val isLive: Boolean
    )

    private companion object {
        const val PREFERENCES = "tivihub.settings"
        const val THEME = "theme"
        const val CATALOG_COLUMNS = "catalog.columns"
        const val AUTO_REFRESH = "epg.auto_refresh"
        const val CATALOG_REFRESH_INTERVAL = "catalog.refresh_interval"
        const val EPG_LAST_FETCHED = "epg.last_fetched"
        const val EPG_REFRESH_INTERVAL = "epg.refresh_interval"
        const val OPEN_SUBTITLES_API_KEY = "subtitles.opensubtitles.api_key"
    }
}

private fun encodeLive(channel: LiveChannel) = JSONObject()
    .put("id", channel.id)
    .put("playlistId", channel.playlistId)
    .put("name", channel.name)
    .put("group", channel.group)
    .put("streamUrl", channel.streamUrl)
    .put("logoUrl", channel.logoUrl)
    .put("tvgId", channel.tvgId)
    .put("drmLicenseUrl", channel.drmLicenseUrl)

private fun decodeLive(reader: Reader): List<LiveChannel> =
    JsonArrayReader.read(reader, "Cached live catalog") { item ->
        LiveChannel(
            id = item.getString("id"),
            playlistId = item.getString("playlistId"),
            name = item.getString("name"),
            group = item.optString("group", "General"),
            streamUrl = item.getString("streamUrl"),
            logoUrl = item.optionalString("logoUrl"),
            tvgId = item.optionalString("tvgId"),
            drmLicenseUrl = item.optionalString("drmLicenseUrl")
        )
    }

private fun encodeMovie(movie: Movie) = JSONObject()
    .put("id", movie.id)
    .put("name", movie.name)
    .put("streamUrl", movie.streamUrl)
    .put("posterUrl", movie.posterUrl)
    .put("overview", movie.overview)
    .put("year", movie.year)
    .put("rating", movie.rating)
    .put("categoryId", movie.categoryId)
    .put("category", movie.category)
    .put("addedAtMillis", movie.addedAtMillis)

private fun decodeMovies(reader: Reader): List<Movie> =
    JsonArrayReader.read(reader, "Cached movie catalog") { item ->
        Movie(
            id = item.getString("id"),
            name = item.getString("name"),
            streamUrl = item.getString("streamUrl"),
            posterUrl = item.optionalString("posterUrl"),
            overview = item.optionalString("overview"),
            year = item.optInt("year").takeIf { item.has("year") && !item.isNull("year") },
            rating = item.optDouble("rating").takeIf { item.has("rating") && !item.isNull("rating") },
            categoryId = item.optionalString("categoryId"),
            category = item.optionalString("category"),
            addedAtMillis = item.optLong("addedAtMillis").takeIf {
                item.has("addedAtMillis") && !item.isNull("addedAtMillis")
            }
        )
    }

private fun encodeSeries(item: Series) = JSONObject()
    .put("id", item.id)
    .put("name", item.name)
    .put("posterUrl", item.posterUrl)
    .put("overview", item.overview)
    .put("seasons", item.seasons)
    .put("categoryId", item.categoryId)
    .put("category", item.category)
    .put("year", item.year)
    .put("rating", item.rating)
    .put("addedAtMillis", item.addedAtMillis)

private fun decodeSeries(reader: Reader): List<Series> =
    JsonArrayReader.read(reader, "Cached series catalog") { item ->
        Series(
            id = item.getString("id"),
            name = item.getString("name"),
            posterUrl = item.optionalString("posterUrl"),
            overview = item.optionalString("overview"),
            seasons = item.optInt("seasons"),
            categoryId = item.optionalString("categoryId"),
            category = item.optionalString("category"),
            year = item.optInt("year").takeIf { item.has("year") && !item.isNull("year") },
            rating = item.optDouble("rating").takeIf { item.has("rating") && !item.isNull("rating") },
            addedAtMillis = item.optLong("addedAtMillis").takeIf {
                item.has("addedAtMillis") && !item.isNull("addedAtMillis")
            }
        )
    }

private fun <T> writeCatalog(writer: Writer, items: List<T>, encodeItem: (T) -> JSONObject) {
    writer.write('['.code)
    items.forEachIndexed { index, item ->
        if (index > 0) writer.write(','.code)
        writer.write(encodeItem(item).toString())
    }
    writer.write(']'.code)
}

private fun JSONObject.optionalString(key: String): String? =
    optString(key).takeUnless { it.isBlank() || it == "null" }
