export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`.trim()} />;
}

export function CardSkeletons({ count, live = false, className = "" }: { count: number; live?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`catalog-grid${live ? " channel-grid" : ""}${className ? ` ${className}` : ""}`}>
      {Array.from({ length: count }, (_, index) => (
        <div className={`catalog-card skeleton-card${live ? " live-card" : ""}`} key={index}>
          <Skeleton className="skeleton-artwork" />
          <div className="catalog-card-copy">
            <Skeleton className="skeleton-line" />
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
