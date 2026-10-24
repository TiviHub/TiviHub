import type { CSSProperties } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton ${className}`.trim()} style={style} />;
}

function SkeletonCards({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div className="catalog-card skeleton-card" key={index}>
      <Skeleton className="skeleton-artwork" />
      <div className="catalog-card-copy">
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line skeleton-line-short" />
      </div>
    </div>
  ));
}

/** Poster cards in a grid of their own. */
export function CardSkeletons({ count, className = "" }: { count: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`catalog-grid${className ? ` ${className}` : ""}`}>
      <SkeletonCards count={count} />
    </div>
  );
}

/** Poster cards as direct children of a grid that already exists (the Movies and Series panel), so they sit where the real cards will. */
export function GridCardSkeletons({ count }: { count: number }) {
  return <SkeletonCards count={count} />;
}

/** Rows of a category panel: a name and a count, as `.browse-category` draws them. */
export function CategorySkeletons({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="skeleton-categories">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-category" key={index}>
          <Skeleton className="skeleton-line skeleton-category-name" style={{ width: `${45 + (index * 17) % 40}%` }} />
          <Skeleton className="skeleton-category-count" />
        </div>
      ))}
    </div>
  );
}

/** Rows of the channel panel: a logo tile and two lines, as `.live-channel-list-item` draws them. */
export function ChannelSkeletons({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="skeleton-categories">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-channel" key={index}>
          <Skeleton className="skeleton-channel-art" />
          <div className="live-channel-list-copy">
            <Skeleton className="skeleton-line" style={{ width: `${55 + (index * 13) % 35}%` }} />
            <Skeleton className="skeleton-line skeleton-line-short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowSkeletons({ count, artwork = false }: { count: number; artwork?: boolean }) {
  return (
    <div aria-hidden="true" className="skeleton-rows">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <Skeleton className={artwork ? "skeleton-row-artwork" : "skeleton-row-index"} />
          <div className="skeleton-row-copy">
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line skeleton-line-short" />
          </div>
        </div>
      ))}
    </div>
  );
}
