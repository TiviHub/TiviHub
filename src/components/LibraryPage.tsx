import { useState } from "react";
import type { ContentType, Favorite, LibraryItem, PlayableItem } from "../types";
import { CustomSelect, Icon, type CustomSelectOption } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";
import { NoSourceEmptyState } from "./NoSourceEmptyState";


type LibraryGroupKey = "LIVE" | "MOVIE" | "SERIES";

const LIBRARY_CONTENT_GROUPS = [
  { key: "LIVE", label: "Live TV", icon: "live_tv" },
  { key: "MOVIE", label: "Movies", icon: "movie" },
  { key: "SERIES", label: "Series", icon: "tv" },
] as const;

function libraryGroupFor(contentType: ContentType): LibraryGroupKey {
  if (contentType === "LIVE") return "LIVE";
  if (contentType === "MOVIE") return "MOVIE";
  return "SERIES";
}


const LIBRARY_STATUS_OPTIONS: readonly CustomSelectOption<LibraryItem["status"]>[] = [
  { label: "Watchlist", value: "WATCHLIST" },
  { label: "Watching", value: "WATCHING" },
  { label: "Watched", value: "WATCHED" },
];


export function LibraryPage({
  library,
  favorites,
  onPlay,
  onChangeStatus,
  onRemove,
  onRemoveFavorite,
  onOpenFavorite,
  onBrowseMovies,
  sourceCount,
  onAddSource,
}: {
  library: LibraryItem[];
  favorites: Favorite[];
  onPlay: (item: PlayableItem, position: number) => void;
  onChangeStatus: (item: LibraryItem, status: LibraryItem["status"]) => void;
  onRemove: (id: string, title: string) => void;
  onRemoveFavorite: (favorite: Favorite) => void;
  onOpenFavorite?: (favorite: Favorite) => void;
  onBrowseMovies?: () => void;
  sourceCount: number;
  onAddSource: () => void;
}) {
  const [tab, setTab] = useState<"Continue watching" | "Watchlist" | "Watched" | "Favorites">("Continue watching");
  const [contentFilter, setContentFilter] = useState<LibraryGroupKey | "ALL">("ALL");
  const watching = [...library]
    .filter((item) => item.status === "WATCHING" && item.contentType !== "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const watchlist = library.filter((item) => item.status === "WATCHLIST" && item.contentType !== "LIVE");
  const watched = library
    .filter((item) => item.status === "WATCHED" && item.contentType !== "LIVE")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const content = tab === "Continue watching" ? watching : tab === "Watchlist" ? watchlist : tab === "Watched" ? watched : [];
  const activeItems = tab === "Favorites" ? favorites : content;
  const visibleContent = contentFilter === "ALL"
    ? content
    : content.filter((item) => libraryGroupFor(item.contentType) === contentFilter);
  const visibleFavorites = contentFilter === "ALL"
    ? favorites
    : favorites.filter((favorite) => libraryGroupFor(favorite.contentType) === contentFilter);

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddSource} />;
  }

  if (library.length === 0 && favorites.length === 0) {
    return (
      <HomeEmptyState
        actionIcon="play_arrow"
        actionLabel="Start watching"
        description="Start watching a movie, series, or live channel and it will appear here."
        eyebrow="YOUR LIBRARY"
        onAction={() => onBrowseMovies?.()}
        title="Your library is empty"
      />
    );
  }

  function playLibraryItem(item: LibraryItem) {
    if (!item.streamUrl) return;
    onPlay({
      id: item.contentId,
      playlistId: item.playlistId,
      contentType: item.contentType,
      title: item.title,
      streamUrl: item.streamUrl,
      artworkUrl: item.artworkUrl,
      live: item.contentType === "LIVE",
      drmLicenseUrl: item.drmLicenseUrl,
      drmSystem: item.drmSystem,
      parentId: item.parentId,
      parentTitle: item.parentTitle,
    }, item.positionMillis);
  }

  return (
    <section className="library-page">
      <header className="page-intro">
        <p className="eyebrow">SAVED ON THIS DEVICE</p>
        <h1>Your library</h1>
        <p>Favorites and watch progress stay in this app.</p>
      </header>
      <div className="library-tabs" role="group" aria-label="Library categories">
        {(["Continue watching", "Watchlist", "Watched", "Favorites"] as const).map((value) => (
          <button
            aria-pressed={tab === value}
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => {
              setTab(value);
              setContentFilter("ALL");
            }}
            type="button"
          >
            <Icon name={value === "Continue watching" ? "play_arrow" : value === "Watchlist" ? "bookmark" : value === "Watched" ? "check_circle" : "favorite"} />
            {value}<span>{value === "Continue watching" ? watching.length : value === "Watchlist" ? watchlist.length : value === "Watched" ? watched.length : favorites.length}</span>
          </button>
        ))}
      </div>
      {activeItems.length > 0 && (
        <div className="library-content-tabs" role="group" aria-label={`Filter ${tab} by content type`}>
          <button
            aria-pressed={contentFilter === "ALL"}
            className={contentFilter === "ALL" ? "active" : ""}
            onClick={() => setContentFilter("ALL")}
            type="button"
          >
            All<span>{activeItems.length}</span>
          </button>
          {LIBRARY_CONTENT_GROUPS.map((group) => {
            const count = activeItems.filter((item) => libraryGroupFor(item.contentType) === group.key).length;
            if (count === 0) return null;
            return (
              <button
                aria-pressed={contentFilter === group.key}
                className={contentFilter === group.key ? "active" : ""}
                key={group.key}
                onClick={() => setContentFilter(group.key)}
                type="button"
              >
                <Icon name={group.icon} />{group.label}<span>{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "Favorites" ? (
        visibleFavorites.length === 0 ? (
          <LibraryEmpty label="No favorites yet" detail="Tap the heart on a channel, movie, or series to keep it here." />
        ) : (
          <div className="favorite-list">
            {visibleFavorites.map((favorite) => (
              <article className={`favorite-row${favorite.contentType === "LIVE" ? " live-favorite-row" : ""}`} key={favorite.id}>
                <button
                  aria-label={favorite.contentType === "LIVE" ? `Play ${favorite.title}` : `View details for ${favorite.title}`}
                  className="favorite-art-button"
                  disabled={favorite.contentType === "LIVE" ? !favorite.streamUrl : !onOpenFavorite}
                  onClick={() => {
                    if (favorite.contentType === "LIVE" && favorite.streamUrl) {
                      onPlay({
                        id: favorite.contentId,
                        playlistId: favorite.playlistId,
                        contentType: favorite.contentType,
                        title: favorite.title,
                        streamUrl: favorite.streamUrl,
                        artworkUrl: favorite.artworkUrl,
                        live: true,
                        drmLicenseUrl: favorite.drmLicenseUrl,
                        drmSystem: favorite.drmSystem,
                      }, 0);
                    } else {
                      onOpenFavorite?.(favorite);
                    }
                  }}
                  type="button"
                >
                  <span className="library-item-art-fallback">
                    <Icon name={LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.icon} />
                  </span>
                  {favorite.artworkUrl && <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={favorite.artworkUrl} />}
                  <span aria-hidden="true" className="library-item-art-play">
                    <Icon name={favorite.contentType === "LIVE" ? "play_arrow" : "arrow_forward"} />
                    <span>{favorite.contentType === "LIVE" ? "Play" : "See details"}</span>
                  </span>
                </button>
                <div>
                  <strong>{favorite.title}</strong>
                  <small>{LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(favorite.contentType))!.label}</small>
                </div>
                {favorite.streamUrl && (
                  <button
                    aria-label={`Play ${favorite.title}`}
                    className="icon-button"
                    data-tooltip="Play"
                    onClick={() => onPlay({
                      id: favorite.contentId,
                      playlistId: favorite.playlistId,
                      contentType: favorite.contentType,
                      title: favorite.title,
                      streamUrl: favorite.streamUrl!,
                      artworkUrl: favorite.artworkUrl,
                      live: favorite.contentType === "LIVE",
                      drmLicenseUrl: favorite.drmLicenseUrl,
                      drmSystem: favorite.drmSystem,
                    }, 0)}
                    type="button"
                  >
                    <Icon name="play_arrow" />
                  </button>
                )}
                <button aria-label={`Remove ${favorite.title} from favorites`} className="icon-button is-favorite" data-tooltip="Remove from favorites" onClick={() => onRemoveFavorite(favorite)} type="button">
                  <Icon name="favorite" />
                </button>
              </article>
            ))}
          </div>
        )
      ) : visibleContent.length === 0 ? (
        <LibraryEmpty
          label={tab === "Continue watching" ? "Nothing in progress" : tab === "Watchlist" ? "Your watchlist is empty" : "Nothing watched yet"}
          detail={tab === "Continue watching"
            ? "Start a movie or episode, and your place will be saved automatically."
            : tab === "Watchlist"
              ? "Add a title from Movies or Series, or change its status to Watchlist."
              : "Change a title's status to Watched when you finish it."}
        />
      ) : (
        <div className="library-items">
          {visibleContent.map((item) => (
            <article className={`library-item${item.contentType === "LIVE" ? " live-library-item" : ""}`} key={item.id}>
                    <button
                      aria-label={`${item.status === "WATCHING" ? "Resume" : item.status === "WATCHED" ? "Replay" : "Watch"} ${item.title}`}
                      className="library-item-main"
                      disabled={!item.streamUrl}
                      onClick={() => playLibraryItem(item)}
                      type="button"
                    >
                      <span className="library-item-art">
                        <span className="library-item-art-fallback">
                          <Icon name={item.contentType === "LIVE" ? "live_tv" : item.contentType === "MOVIE" ? "movie" : "tv"} />
                        </span>
                        {item.artworkUrl && (
                          <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={item.artworkUrl} />
                        )}
                        <span aria-hidden="true" className="library-item-art-play">
                          <Icon name="play_arrow" />
                          <span>{item.status === "WATCHING" ? "Resume" : item.status === "WATCHED" ? "Replay" : "Watch"}</span>
                        </span>
                      </span>
                      <span className="library-item-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(item.contentType))?.label}
                          {item.parentTitle ? ` · ${item.parentTitle}` : ""}
                          {item.status === "WATCHING" && item.durationMillis > 0 ? ` · ${Math.round(Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100)))}% watched` : ""}
                        </small>
                        {item.durationMillis > 0 && (
                          <span className="library-progress">
                            <span style={{ width: `${Math.max(0, Math.min(100, item.positionMillis / item.durationMillis * 100))}%` }} />
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="status-select">
                      <CustomSelect
                        ariaLabel={`Library status for ${item.title}`}
                        onValueChange={(status) => onChangeStatus(item, status)}
                        options={LIBRARY_STATUS_OPTIONS}
                        value={item.status}
                        variant="compact"
                      />
                    </div>
                    <button aria-label={`Remove ${item.title} from library`} className="icon-button" data-tooltip="Remove from library" onClick={() => onRemove(item.id, item.title)} type="button">
                      <Icon name="delete" />
                    </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryEmpty({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="catalog-empty library-empty">
      <div className="empty-icon"><Icon name="bookmark" /></div>
      <h2>{label}</h2>
      <p>{detail}</p>
    </div>
  );
}
