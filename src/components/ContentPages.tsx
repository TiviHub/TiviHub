import { Skeleton } from "./Skeleton";
import type { EpgProgram, LiveChannel, Movie, PlayableItem, Series } from "../types";
import { Icon } from "./common";

type CatalogSection = "Live TV" | "Movies" | "Series";
type CatalogItem = LiveChannel | Movie | Series;

function titleOf(item: CatalogItem): string {
  return item.name;
}

function categoryOf(item: CatalogItem): string {
  return "group" in item ? item.group : item.category || "Uncategorized";
}

function artworkOf(item: CatalogItem): string | undefined {
  return "group" in item ? item.logoUrl : item.posterUrl;
}

export function playableChannel(channel: LiveChannel): PlayableItem {
  return {
    id: channel.id,
    playlistId: channel.playlistId,
    contentType: "LIVE",
    title: channel.name,
    streamUrl: channel.streamUrl,
    artworkUrl: channel.logoUrl,
    drmLicenseUrl: channel.drmLicenseUrl,
    drmSystem: channel.drmSystem,
    live: true,
    radio: channel.radio,
  };
}

export function CatalogCard({
  item,
  section,
  subtitleOverride,
  isFavorite,
  inLibrary,
  currentProgram,
  guideLoading = false,
  onOpen,
  onFavorite,
  onAddToLibrary,
}: {
  item: CatalogItem;
  section: CatalogSection;
  subtitleOverride?: string;
  isFavorite: boolean;
  inLibrary: boolean;
  currentProgram?: EpgProgram;
  guideLoading?: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onAddToLibrary: () => void;
}) {
  const artwork = artworkOf(item);
  const isLive = section === "Live TV";
  const subtitle = subtitleOverride ?? (isLive
    ? currentProgram?.title || categoryOf(item)
    : categoryOf(item));
  return (
    <article className={`catalog-card${isLive ? " live-card" : ""}`}>
      <button
        aria-label={isLive ? `Play ${item.name}` : `View details for ${item.name}`}
        className="catalog-card-main"
        data-tooltip={isLive ? `Play ${item.name}` : `View details for ${item.name}`}
        onClick={onOpen}
        type="button"
      >
        <span className="catalog-artwork">
          <span className="catalog-artwork-fallback"><Icon name={isLive ? "live_tv" : section === "Movies" ? "movie" : "tv"} /></span>
          {artwork && (
            <img
              alt=""
              draggable={false}
              loading="lazy"
              onError={(event) => { event.currentTarget.hidden = true; }}
              src={artwork}
            />
          )}
          {isLive && <span className="live-badge"><span /> LIVE</span>}
          {!isLive && "seasons" in item && item.seasons > 0 && (
            <span className="catalog-meta">{item.seasons} seasons</span>
          )}
        </span>
        <span className="catalog-card-copy">
          <strong data-tooltip={titleOf(item)}>{titleOf(item)}</strong>
          <small data-tooltip={subtitle}>{subtitle}</small>
          {isLive && guideLoading && !currentProgram && <Skeleton className="skeleton-line" />}
          {currentProgram && (
            <span className="program-progress">
              <span style={{ width: `${Math.max(0, Math.min(100, ((Date.now() - currentProgram.startMillis) / (currentProgram.endMillis - currentProgram.startMillis)) * 100))}%` }} />
            </span>
          )}
        </span>
      </button>
      <button
        aria-label={isFavorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
        aria-pressed={isFavorite}
        className={`favorite-button${isFavorite ? " selected" : ""}`}
        data-tooltip={`${isFavorite ? "Remove" : "Add"} ${isLive ? "TV Channel" : section === "Movies" ? "Movie" : "Series"} ${isFavorite ? "from" : "to"} favorites`}
        onClick={onFavorite}
        type="button"
      >
        <Icon name={isFavorite ? "favorite" : "favorite_border"} />
      </button>
      {!isLive && (
        <button
          aria-label={inLibrary ? `${item.name} is saved in your library` : `Add ${item.name} to your watchlist`}
          aria-pressed={inLibrary}
          className={`catalog-library-button${inLibrary ? " selected" : ""}`}
          data-tooltip={inLibrary ? "Already in your library" : "Add to watchlist"}
          disabled={inLibrary}
          onClick={onAddToLibrary}
          type="button"
        >
          <Icon name={inLibrary ? "check" : "library_add"} />
        </button>
      )}
    </article>
  );
}
