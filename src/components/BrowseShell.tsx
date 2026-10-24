import type { ReactNode } from "react";
import { formatNumber } from "../lib/i18n";

/**
 * The frame of every two-panel page (Movies, Series, Library, TV Guide, Downloads, Settings): a 320px panel on the left,
 * one wide panel with a 56px heading, an optional row of tools and the content. Flush against the sidebar, no page scroll.
 */
export function BrowseShell({ label, nav, title, count, tools, bodyClassName = "live-channel-list browse-list", children }: {
  label: string;
  nav: ReactNode;
  title: string;
  count?: number;
  tools?: ReactNode;
  /** The scrolling area; lists use the default, a page that draws its own surface (the guide grid) passes its class. */
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className="catalog-page">
      <h1 className="sr-only">{label}</h1>
      <div className="live-tv-layout browse-layout movies-layout">
        {nav}
        <aside aria-label={title} className="live-channel-sidebar">
          <div className="live-channel-sidebar-heading">
            <h2>{title}</h2>
            {count !== undefined && <span>{formatNumber(count)}</span>}
          </div>
          {tools && <div className="browse-panel-tools">{tools}</div>}
          <div className={bodyClassName}>{children}</div>
        </aside>
      </div>
    </section>
  );
}
