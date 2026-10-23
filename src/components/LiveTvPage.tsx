import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveBrowse } from "../hooks/useLiveBrowse";
import type { EpgProgram, Favorite, LiveChannel, PlayableItem, Playlist } from "../types";
import { BrowseCategoryList, type BrowseCategoryEntry } from "./BrowseCategoryList";
import { playableChannel } from "./ContentPages";
import { Icon } from "./common";
import { RowSkeletons, Skeleton } from "./Skeleton";

const FAVORITES_ID = "@@favorites";

function ChannelRow({
  channel,
  current,
  guideLoading,
  isFavorite,
  isSelected,
  isPlaying,
  onPlay,
  onToggleFavorite,
}: {
  channel: LiveChannel;
  current?: EpgProgram;
  guideLoading: boolean;
  isFavorite: boolean;
  isSelected: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <article className={`live-channel-list-item${isSelected ? " selected" : ""}`} role="listitem">
      <button
        aria-label={`Play ${channel.name}`}
        aria-pressed={isSelected}
        className="live-channel-select"
        data-tooltip={`${channel.name} · ${channel.group}${current ? ` · ${current.title}` : ""}`}
        onClick={onPlay}
        type="button"
      >
        <span className="live-channel-list-art">
          {channel.logoUrl ? (
            <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={channel.logoUrl} />
          ) : <Icon name={channel.radio ? "radio" : "live_tv"} />}
        </span>
        <span className="live-channel-list-copy">
          <strong>{channel.name}</strong>
          <small>{channel.group}</small>
          {current && <small className="live-channel-current-program">{current.title}</small>}
          {!current && guideLoading && <Skeleton className="skeleton-line" />}
        </span>
        {isPlaying && <span aria-label="Playing" className="live-channel-playing"><Icon name="play_arrow" /></span>}
      </button>
      <button
        aria-label={isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
        aria-pressed={isFavorite}
        className={`live-channel-favorite${isFavorite ? " selected" : ""}`}
        data-tooltip={isFavorite ? "Remove TV Channel from favorites" : "Add TV Channel to favorites"}
        onClick={onToggleFavorite}
        type="button"
      >
        <Icon name={isFavorite ? "favorite" : "favorite_border"} />
      </button>
    </article>
  );
}

/**
 * Live TV: categories on the left, the channels of the chosen one next to it (loaded a batch at a time as you
 * scroll), the player on the right. Nothing is downloaded for a category until it is opened.
 */
export function LiveTvPage({
  source,
  storedChannels,
  showAdultContent,
  epg,
  favorites,
  guideLoading,
  onLoadGuideForChannels,
  onPlay,
  onToggleFavorite,
  onCheckStreamGroup,
  livePlayer,
  livePlaybackItemId,
  livePlayerMini = false,
}: {
  source: Playlist | undefined;
  storedChannels: LiveChannel[];
  showAdultContent: boolean;
  epg: EpgProgram[];
  favorites: Favorite[];
  guideLoading: boolean;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onPlay: (item: PlayableItem) => void;
  onToggleFavorite: (item: LiveChannel, contentType: "LIVE") => void;
  onCheckStreamGroup?: (channels: LiveChannel[], groupName: string) => void;
  livePlayer?: ReactNode;
  livePlaybackItemId?: string;
  livePlayerMini?: boolean;
}) {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [now, setNow] = useState(Date.now);
  const showingFavorites = chosen === FAVORITES_ID;
  const browse = useLiveBrowse({
    source,
    storedChannels,
    showAdultContent,
    chosenCategoryId: showingFavorites ? undefined : chosen,
    query,
    paused: showingFavorites,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const favoriteChannels = useMemo<LiveChannel[]>(() => favorites
    .filter((favorite) => favorite.contentType === "LIVE" && favorite.playlistId === source?.id && favorite.streamUrl)
    .map((favorite) => ({
      id: favorite.contentId,
      playlistId: favorite.playlistId,
      name: favorite.title,
      group: "Favorites",
      streamUrl: favorite.streamUrl!,
      logoUrl: favorite.artworkUrl,
      drmLicenseUrl: favorite.drmLicenseUrl,
      drmSystem: favorite.drmSystem,
    })), [favorites, source?.id]);
  const favoriteIds = useMemo(() => new Set(favoriteChannels.map((channel) => channel.id)), [favoriteChannels]);
  const shownChannels = useMemo(() => {
    if (!showingFavorites) return browse.items;
    const needle = query.trim().toLowerCase();
    return favoriteChannels.filter((channel) => !needle || channel.name.toLowerCase().includes(needle));
  }, [browse.items, favoriteChannels, query, showingFavorites]);

  const currentByChannel = useMemo(() => {
    const current = new Map<string, EpgProgram>();
    for (const program of epg) {
      if (program.startMillis <= now && program.endMillis > now) current.set(program.channelId, program);
    }
    return current;
  }, [epg, now]);

  const loadGuide = useEffectEvent(onLoadGuideForChannels);
  useEffect(() => {
    if (shownChannels.length > 0) loadGuide(shownChannels);
  }, [shownChannels]);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canObserve = typeof IntersectionObserver !== "undefined";
  const { hasMore, loadMore } = browse;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || !canObserve || showingFavorites) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root: listRef.current, rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canObserve, hasMore, loadMore, showingFavorites, shownChannels.length]);

  const categoryEntries = useMemo<BrowseCategoryEntry[]>(() => [
    { id: FAVORITES_ID, name: "Favorites", count: favoriteChannels.length, pinned: true },
    ...(browse.supportsAll ? [{ id: "", name: "All", pinned: true }] : []),
    ...browse.categories,
  ], [browse.categories, browse.supportsAll, favoriteChannels.length]);
  const effectiveId = showingFavorites ? FAVORITES_ID : browse.categoryId;
  const categoryName = showingFavorites
    ? "Favorites"
    : effectiveId === null || effectiveId === undefined
      ? "All"
      : browse.categories.find((category) => category.id === effectiveId)?.name ?? "";
  const visibleChannel = selectedChannel ?? shownChannels.find((channel) => channel.id === livePlaybackItemId) ?? shownChannels[0];
  const groupId = !showingFavorites && typeof effectiveId === "string" ? effectiveId : null;

  function play(channel: LiveChannel) {
    setSelectedChannel(channel);
    onPlay(playableChannel(channel));
  }

  function checkGroup() {
    if (!browse.browser || !groupId || !onCheckStreamGroup) return;
    void browse.browser.channelsOf(groupId).then((channels) => onCheckStreamGroup(channels, categoryName));
  }

  return (
    <section className={`catalog-page${livePlayerMini ? " live-tv-mini-page" : ""}`}>
      <h1 className="sr-only">Live TV</h1>
      <div className="live-tv-layout browse-layout">
        <div className="live-channel-columns has-categories">
          <BrowseCategoryList
            categories={categoryEntries}
            error={browse.categoriesError}
            loading={browse.categoriesLoading}
            onRetry={browse.retry}
            onSelect={setChosen}
            selectedId={effectiveId}
            title="Live categories"
          />
          <aside aria-label="Live TV channels" className="live-channel-sidebar">
            <div className="live-channel-sidebar-heading">
              <h2>{categoryName || "Channels"}</h2>
              <span>{(showingFavorites ? favoriteChannels.length : browse.total ?? shownChannels.length).toLocaleString()}</span>
            </div>
            <div className="browse-panel-tools">
              <label className="search-field">
                <Icon name="search" />
                <span className="sr-only">Search Live TV</span>
                <input onChange={(event) => setQuery(event.target.value)} placeholder="Search live tv" value={query} />
              </label>
              {groupId && onCheckStreamGroup && (
                <button
                  aria-label={`Check all channels in ${categoryName}`}
                  className="icon-button"
                  data-tooltip="Check all channels in this group"
                  onClick={checkGroup}
                  type="button"
                >
                  <Icon name="check_circle" />
                </button>
              )}
            </div>
            <div className="live-channel-list" ref={listRef} role="list">
              {browse.loading && (
                <div aria-live="polite" role="status">
                  <span className="sr-only">Loading channels…</span>
                  <RowSkeletons artwork count={8} />
                </div>
              )}
              {showingFavorites && shownChannels.length === 0 && (
                <div className="live-guide-empty">Tap the heart on a channel to add it here.</div>
              )}
              {!browse.loading && !showingFavorites && !browse.error && shownChannels.length === 0 && (
                <div className="live-guide-empty">{query.trim() ? "No channels match your search." : "No channels in this category."}</div>
              )}
              {shownChannels.map((channel) => (
                <ChannelRow
                  channel={channel}
                  current={currentByChannel.get(channel.tvgId || channel.id)}
                  guideLoading={guideLoading}
                  isFavorite={favoriteIds.has(channel.id)}
                  isPlaying={livePlaybackItemId === channel.id}
                  isSelected={visibleChannel?.id === channel.id}
                  key={channel.id}
                  onPlay={() => play(channel)}
                  onToggleFavorite={() => onToggleFavorite(channel, "LIVE")}
                />
              ))}
              {browse.error && (
                <div className="browse-message" role="alert">
                  <p>{browse.error}</p>
                  <button className="text-button" onClick={browse.retry} type="button">Try again</button>
                </div>
              )}
              {hasMore && !showingFavorites && (canObserve
                ? <div aria-hidden="true" className="browse-sentinel" ref={sentinelRef} />
                : <button className="text-button" onClick={loadMore} type="button">Load more</button>)}
            </div>
          </aside>
        </div>
        <div className="live-tv-main">
          <section aria-label="Live player" className={`live-tv-player${livePlayer ? " has-live-player" : ""}`}>
            {livePlayer ?? (
              <div className="live-player-empty">
                <div className="live-player-empty-art">
                  {visibleChannel?.logoUrl ? <img alt="" src={visibleChannel.logoUrl} /> : <Icon name="live_tv" />}
                </div>
                <h2>{visibleChannel?.name ?? "Choose a channel"}</h2>
                <p>
                  {visibleChannel
                    ? (currentByChannel.get(visibleChannel.tvgId || visibleChannel.id)?.title
                      ? `On now: ${currentByChannel.get(visibleChannel.tvgId || visibleChannel.id)?.title}`
                      : visibleChannel.group)
                    : "Select a channel to start its live stream."}
                </p>
                {visibleChannel && (
                  <button className="primary-button" onClick={() => play(visibleChannel)} type="button">
                    <Icon name="play_arrow" /> Watch live
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
