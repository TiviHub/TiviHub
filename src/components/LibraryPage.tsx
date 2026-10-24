import { useState } from "react";
import type { ContentType, Favorite, LibraryItem, PlayableItem } from "../types";
import { CustomSelect, Icon, SearchField, type CustomSelectOption, type IconName } from "./common";
import { BrowseShell } from "./BrowseShell";
import { EmptyPanel } from "./EmptyPanel";
import { LibraryCard } from "./LibraryCard";
import { NavPanel } from "./NavPanel";
import { NoSourceEmptyState } from "./NoSourceEmptyState";


type LibraryGroupKey = "LIVE" | "MOVIE" | "SERIES";

const LIBRARY_CONTENT_GROUPS = [
  { key: "LIVE", label: "Live TV", icon: "live_tv" },
  { key: "MOVIE", label: "Movies", icon: "movie" },
  { key: "SERIES", label: "Series", icon: "tv" },
] as const;

function groupLabel(contentType: ContentType): string {
  return LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(contentType))!.label;
}

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
  sourceCount: number;
  onAddSource: () => void;
}) {
  const [tab, setTab] = useState<"Continue watching" | "Watchlist" | "Watched" | "Favorites">("Continue watching");
  const [query, setQuery] = useState("");
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
  const needle = query.trim().toLowerCase();
  const matches = (entry: { title: string; contentType: ContentType }) =>
    (contentFilter === "ALL" || libraryGroupFor(entry.contentType) === contentFilter) && (!needle || entry.title.toLowerCase().includes(needle));
  const narrowed = Boolean(needle) || contentFilter !== "ALL";
  const visibleContent = content.filter(matches);
  const visibleFavorites = favorites.filter(matches);

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddSource} />;
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

  const tabs = [
    { id: "Continue watching", label: "Continue watching", icon: "play_arrow", count: watching.length },
    { id: "Watchlist", label: "Watchlist", icon: "bookmark", count: watchlist.length },
    { id: "Watched", label: "Watched", icon: "check_circle", count: watched.length },
    { id: "Favorites", label: "Favorites", icon: "favorite", count: favorites.length },
  ] as const;

  return (
    <BrowseShell
      bodyClassName="live-channel-list browse-list movies-grid"
      count={tab === "Favorites" ? visibleFavorites.length : visibleContent.length}
      label="Your library"
      nav={(
        <NavPanel
          items={[...tabs]}
          onSelect={(id) => {
            setTab(id as typeof tab);
            setContentFilter("ALL");
          }}
          selectedId={tab}
          title="Library"
        />
      )}
      title={tab}
      tools={activeItems.length > 0 ? (
        <>
        <SearchField label={`Search ${tab.toLowerCase()}`} onChange={setQuery} placeholder="Search titles" value={query} />
        <div className="live-guide-select">
          <Icon name="filter_list" />
          <CustomSelect
            ariaLabel={`Filter ${tab} by content type`}
            onValueChange={setContentFilter}
            options={[
              { label: `All (${activeItems.length})`, value: "ALL" },
              ...LIBRARY_CONTENT_GROUPS
                .map((group) => ({ label: group.label, value: group.key, count: activeItems.filter((item) => libraryGroupFor(item.contentType) === group.key).length }))
                .filter((group) => group.count > 0)
                .map((group) => ({ label: `${group.label} (${group.count})`, value: group.value })),
            ]}
            value={contentFilter}
            variant="embedded"
          />
        </div>
        </>
      ) : undefined}
    >
      {tab === "Favorites" ? (
        visibleFavorites.length === 0 ? (
          <LibraryEmpty icon={narrowed ? "search" : "favorite_border"} label={narrowed ? "No matches" : "No favorites yet"} detail={narrowed ? "Try another title or content type." : "Tap the heart on a channel, movie, or series to keep it here."} />
        ) : visibleFavorites.map((favorite) => (
          <LibraryCard
            artworkUrl={favorite.artworkUrl}
            contentType={favorite.contentType}
            disabled={favorite.contentType === "LIVE" ? !favorite.streamUrl : !onOpenFavorite}
            isFavorite
            key={favorite.id}
            onOpen={() => {
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
            onRemove={() => onRemoveFavorite(favorite)}
            openLabel={favorite.contentType === "LIVE" ? `Play ${favorite.title}` : `View details for ${favorite.title}`}
            removeLabel={`Remove ${favorite.title} from favorites`}
            removeTooltip="Remove from favorites"
            subtitle={groupLabel(favorite.contentType)}
            title={favorite.title}
          />
        ))
      ) : visibleContent.length === 0 ? (
        <LibraryEmpty
          icon={narrowed ? "search" : tab === "Watchlist" ? "bookmark" : tab === "Watched" ? "check_circle" : "play_arrow"}
          label={narrowed ? "No matches" : tab === "Continue watching" ? "Nothing in progress" : tab === "Watchlist" ? "Your watchlist is empty" : "Nothing watched yet"}
          detail={narrowed ? "Try another title or content type." : tab === "Continue watching"
            ? "Start a movie or episode, and your place will be saved automatically."
            : tab === "Watchlist"
              ? "Add a title from Movies or Series, or change its status to Watchlist."
              : "Change a title's status to Watched when you finish it."}
        />
      ) : visibleContent.map((item) => (
        <LibraryCard
          artworkUrl={item.artworkUrl}
          contentType={item.contentType}
          disabled={!item.streamUrl}
          key={item.id}
          onOpen={() => playLibraryItem(item)}
          onRemove={() => onRemove(item.id, item.title)}
          openLabel={`${item.status === "WATCHING" ? "Resume" : item.status === "WATCHED" ? "Replay" : "Watch"} ${item.title}`}
          progress={item.durationMillis > 0 ? item.positionMillis / item.durationMillis * 100 : undefined}
          removeLabel={`Remove ${item.title} from library`}
          removeTooltip="Remove from library"
          subtitle={`${groupLabel(item.contentType)}${item.parentTitle ? ` · ${item.parentTitle}` : ""}`}
          title={item.title}
        >
          <div className="status-select">
            <CustomSelect
              ariaLabel={`Library status for ${item.title}`}
              onValueChange={(status) => onChangeStatus(item, status)}
              options={LIBRARY_STATUS_OPTIONS}
              value={item.status}
              variant="compact"
            />
          </div>
        </LibraryCard>
      ))}
    </BrowseShell>
  );
}

function LibraryEmpty({ label, detail, icon }: { label: string; detail: string; icon: IconName }) {
  return <EmptyPanel className="movies-grid-message" icon={icon} title={label}>{detail}</EmptyPanel>;
}
