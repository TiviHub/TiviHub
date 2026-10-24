import type { ReactNode } from "react";
import type { ContentType } from "../types";
import { Icon } from "./common";

/** A saved title in the Library: the same card as Movies and Series, with its own round action top-right. */
export function LibraryCard({ title, subtitle, contentType, artworkUrl, openLabel, disabled, progress, removeLabel, removeTooltip, isFavorite, onOpen, onRemove, children }: {
  title: string;
  subtitle: string;
  contentType: ContentType;
  artworkUrl?: string;
  openLabel: string;
  disabled?: boolean;
  /** 0-100; a thin bar under the title when set. */
  progress?: number;
  removeLabel: string;
  removeTooltip: string;
  /** A favorite shows its pink heart; a library title shows a delete icon. */
  isFavorite?: boolean;
  onOpen: () => void;
  onRemove: () => void;
  /** Extra controls under the title (the status dropdown). */
  children?: ReactNode;
}) {
  const isLive = contentType === "LIVE";
  return (
    <article className={`catalog-card${isLive ? " live-card" : ""}`}>
      <button aria-label={openLabel} className="catalog-card-main" data-tooltip={openLabel} disabled={disabled} onClick={onOpen} type="button">
        <span className="catalog-artwork">
          <span className="catalog-artwork-fallback"><Icon name={isLive ? "live_tv" : contentType === "MOVIE" ? "movie" : "tv"} /></span>
          {artworkUrl && <img alt="" draggable={false} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={artworkUrl} />}
          {isLive && <span className="live-badge"><span /> LIVE</span>}
        </span>
        <span className="catalog-card-copy">
          <strong data-tooltip={title}>{title}</strong>
          <small data-tooltip={subtitle}>{subtitle}</small>
          {progress !== undefined && <span className="program-progress"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span>}
        </span>
      </button>
      <button
        aria-label={removeLabel}
        className={`favorite-button${isFavorite ? " selected" : ""}`}
        data-tooltip={removeTooltip}
        onClick={onRemove}
        type="button"
      >
        <Icon name={isFavorite ? "favorite" : "delete"} />
      </button>
      {children}
    </article>
  );
}
