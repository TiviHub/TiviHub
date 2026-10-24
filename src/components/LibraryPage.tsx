import { useState } from "react";
import { t } from "../lib/i18n";
import type { MessageKey } from "../locales";
import type { ContentType, Favorite, LibraryItem, PlayableItem } from "../types";
import { CustomSelect, Icon, SearchField, type CustomSelectOption, type IconName } from "./common";
import { BrowseShell } from "./BrowseShell";
import { EmptyPanel } from "./EmptyPanel";
import { LibraryCard } from "./LibraryCard";
import { NavPanel } from "./NavPanel";
import { NoSourceEmptyState } from "./NoSourceEmptyState";


type LibraryGroupKey = "LIVE" | "MOVIE" | "SERIES";

const LIBRARY_CONTENT_GROUPS = [
  { key: "LIVE", label: "nav.liveTv", icon: "live_tv" },
  { key: "MOVIE", label: "nav.movies", icon: "movie" },
  { key: "SERIES", label: "nav.series", icon: "tv" },
] as const satisfies readonly { key: LibraryGroupKey; label: MessageKey; icon: string }[];

function groupLabel(contentType: ContentType): string {
  return t(LIBRARY_CONTENT_GROUPS.find((group) => group.key === libraryGroupFor(contentType))!.label);
}

function libraryGroupFor(contentType: ContentType): LibraryGroupKey {
  if (contentType === "LIVE") return "LIVE";
  if (contentType === "MOVIE") return "MOVIE";
  return "SERIES";
}


const libraryStatusOptions = (): readonly CustomSelectOption<LibraryItem["status"]>[] => [
  { label: t("library.statusWatchlist"), value: "WATCHLIST" },
  { label: t("library.statusWatching"), value: "WATCHING" },
  { label: t("library.statusWatched"), value: "WATCHED" },
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
    { id: "Continue watching", label: t("library.tabContinue"), icon: "play_arrow", count: watching.length },
    { id: "Watchlist", label: t("library.tabWatchlist"), icon: "bookmark", count: watchlist.length },
    { id: "Watched", label: t("library.tabWatched"), icon: "check_circle", count: watched.length },
    { id: "Favorites", label: t("browse.favorites"), icon: "favorite", count: favorites.length },
  ] as const;

  return (
    <BrowseShell
      bodyClassName="live-channel-list browse-list movies-grid"
      count={tab === "Favorites" ? visibleFavorites.length : visibleContent.length}
      label={t("library.aria")}
      nav={(
        <NavPanel
          items={[...tabs]}
          onSelect={(id) => {
            setTab(id as typeof tab);
            setContentFilter("ALL");
          }}
          selectedId={tab}
          title={t("nav.library")}
        />
      )}
      title={tabs.find((entry) => entry.id === tab)?.label ?? tab}
      tools={activeItems.length > 0 ? (
        <>
        <SearchField label={t("library.searchLabel", { tab: tabs.find((entry) => entry.id === tab)?.label ?? tab })} onChange={setQuery} placeholder={t("library.searchPlaceholder")} value={query} />
        <div className="live-guide-select">
          <Icon name="filter_list" />
          <CustomSelect
            ariaLabel={t("library.filterBy", { tab: tabs.find((entry) => entry.id === tab)?.label ?? tab })}
            onValueChange={setContentFilter}
            options={[
              { label: t("library.filterAll", { count: activeItems.length }), value: "ALL" },
              ...LIBRARY_CONTENT_GROUPS
                .map((group) => ({ label: t(group.label), value: group.key, count: activeItems.filter((item) => libraryGroupFor(item.contentType) === group.key).length }))
                .filter((group) => group.count > 0)
                .map((group) => ({ label: t("library.filterOption", { label: group.label, count: group.count }), value: group.value })),
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
          <LibraryEmpty icon={narrowed ? "search" : "favorite_border"} label={narrowed ? t("categories.noMatchesTitle") : t("library.noFavoritesTitle")} detail={narrowed ? t("library.noMatchesBody") : t("library.noFavoritesBody")} />
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
            openLabel={favorite.contentType === "LIVE" ? t("card.play", { name: favorite.title }) : t("card.details", { name: favorite.title })}
            removeLabel={t("card.favRemove", { name: favorite.title })}
            removeTooltip={t("library.removeFavoriteTooltip")}
            subtitle={groupLabel(favorite.contentType)}
            title={favorite.title}
          />
        ))
      ) : visibleContent.length === 0 ? (
        <LibraryEmpty
          icon={narrowed ? "search" : tab === "Watchlist" ? "bookmark" : tab === "Watched" ? "check_circle" : "play_arrow"}
          label={narrowed ? t("categories.noMatchesTitle") : tab === "Continue watching" ? t("library.continueEmptyTitle") : tab === "Watchlist" ? t("library.watchlistEmptyTitle") : t("library.watchedEmptyTitle")}
          detail={narrowed ? t("library.noMatchesBody") : tab === "Continue watching"
            ? t("library.continueEmptyBody")
            : tab === "Watchlist"
              ? t("library.watchlistEmptyBody")
              : t("library.watchedEmptyBody")}
        />
      ) : visibleContent.map((item) => (
        <LibraryCard
          artworkUrl={item.artworkUrl}
          contentType={item.contentType}
          disabled={!item.streamUrl}
          key={item.id}
          onOpen={() => playLibraryItem(item)}
          onRemove={() => onRemove(item.id, item.title)}
          openLabel={t(item.status === "WATCHING" ? "library.resume" : item.status === "WATCHED" ? "library.replay" : "library.watch", { title: item.title })}
          progress={item.durationMillis > 0 ? item.positionMillis / item.durationMillis * 100 : undefined}
          removeLabel={t("library.removeLabel", { title: item.title })}
          removeTooltip={t("library.removeTooltip")}
          subtitle={`${groupLabel(item.contentType)}${item.parentTitle ? ` · ${item.parentTitle}` : ""}`}
          title={item.title}
        >
          <div className="status-select">
            <CustomSelect
              ariaLabel={t("library.statusFor", { title: item.title })}
              onValueChange={(status) => onChangeStatus(item, status)}
              options={libraryStatusOptions()}
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
