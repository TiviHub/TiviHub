import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { sortByName } from "../browse/lists";
import type { BrowseSort } from "../browse/types";
import { useLiveBrowse } from "../hooks/useLiveBrowse";
import { FAVORITES_ID, useCategoryEntries } from "../hooks/useCategoryEntries";
import type { EpgProgram, Favorite, LiveChannel, PlayableItem, Playlist } from "../types";
import { BrowseCategoryList } from "./BrowseCategoryList";
import { BrowseSortButton } from "./BrowseSortButton";
import { playableChannel } from "./ContentPages";
import { Icon, SearchField } from "./common";
import { EmptyPanel } from "./EmptyPanel";
import { LiveGuide } from "./LiveGuide";
import { ChannelSkeletons, Skeleton } from "./Skeleton";

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
  onReplay,
  onToggleFavorite,
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
  onReplay: (channel: LiveChannel, program: EpgProgram) => void;
  onToggleFavorite: (item: LiveChannel, contentType: "LIVE") => void;
  livePlayer?: ReactNode;
  livePlaybackItemId?: string;
  livePlayerMini?: boolean;
}) {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("default");
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [now, setNow] = useState(Date.now);
  const showingFavorites = chosen === FAVORITES_ID;
  const browse = useLiveBrowse({
    source,
    storedChannels,
    showAdultContent,
    chosenCategoryId: showingFavorites ? undefined : chosen,
    query,
    sort,
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
    const matching = favoriteChannels.filter((channel) => !needle || channel.name.toLowerCase().includes(needle));
    return sort === "default" ? matching : sortByName(matching, sort);
  }, [browse.items, favoriteChannels, query, showingFavorites, sort]);

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

  // Every source imports all its live channels, so what is stored counts each category exactly.
  const storedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of storedChannels) {
      if (channel.playlistId === source?.id) counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
    }
    return counts;
  }, [source?.id, storedChannels]);
  const categoryEntries = useCategoryEntries(browse, query, favoriteChannels.length, showingFavorites, storedCounts);
  const effectiveId = showingFavorites ? FAVORITES_ID : browse.categoryId;
  const categoryName = showingFavorites
    ? "Favorites"
    : effectiveId === null || effectiveId === undefined
      ? "All"
      : browse.categories.find((category) => category.id === effectiveId)?.name ?? "";
  const visibleChannel = selectedChannel ?? shownChannels.find((channel) => channel.id === livePlaybackItemId) ?? shownChannels[0];

  const guideChannels = useMemo(() => (visibleChannel ? [visibleChannel] : []), [visibleChannel]);
  const onNow = visibleChannel ? currentByChannel.get(visibleChannel.tvgId || visibleChannel.id) : undefined;

  function play(channel: LiveChannel) {
    setSelectedChannel(channel);
    onPlay(playableChannel(channel));
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
              <SearchField label="Search Live TV" onChange={setQuery} placeholder="Search live tv" value={query} />
              <BrowseSortButton label="Sort channels" onChange={setSort} value={sort} />
            </div>
            <div className={`live-channel-list browse-list${browse.loading ? " is-loading" : ""}`} ref={listRef} role="list">
              {browse.loading && (
                <div aria-live="polite" role="status">
                  <span className="sr-only">Loading channels…</span>
                  <ChannelSkeletons count={20} />
                </div>
              )}
              {showingFavorites && shownChannels.length === 0 && (
                <EmptyPanel icon="favorite_border" title="No favorite channels">Tap the heart on a channel to keep it here.</EmptyPanel>
              )}
              {!browse.loading && !showingFavorites && !browse.error && shownChannels.length === 0 && (
                query.trim()
                  ? <EmptyPanel icon="search" title="No matches">No channels match your search.</EmptyPanel>
                  : <EmptyPanel icon="live_tv" title="No channels">There are no channels in this category.</EmptyPanel>
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
                <EmptyPanel action={<button className="secondary-button" onClick={browse.retry} type="button">Try again</button>} error icon="error_outline" title="Could not load channels">{browse.error}</EmptyPanel>
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
              <>
                <div className="live-channel-sidebar-heading">
                  <h2>{visibleChannel?.name ?? "Choose a channel"}</h2>
                </div>
                <div className="live-player-empty">
                  <div className="live-player-empty-art">
                    {visibleChannel?.logoUrl ? <img alt="" src={visibleChannel.logoUrl} /> : <Icon name="live_tv" />}
                  </div>
                  <p>{visibleChannel ? (onNow ? `On now: ${onNow.title}` : visibleChannel.group) : "Select a channel to start its live stream."}</p>
                  {visibleChannel && (
                    <button className="primary-button" onClick={() => play(visibleChannel)} type="button">
                      <Icon name="play_arrow" /> Watch live
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
          {livePlayer && visibleChannel && !livePlayerMini && (
            <LiveGuide
              activeChannelId={livePlaybackItemId}
              channels={guideChannels}
              epg={epg}
              favoriteIds={favoriteIds}
              loading={guideLoading}
              onLoadGuideForChannels={onLoadGuideForChannels}
              onPlay={play}
              onReplay={onReplay}
              single
            />
          )}
        </div>
      </div>
    </section>
  );
}
