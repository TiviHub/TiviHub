# Browse-first redesign (the IPTVnator way, in TiviHub's design)

## Why

Today adding a source downloads its whole catalog into the database (up to hundreds of thousands of rows),
then every screen reads that copy. On a big portal that is minutes of waiting, a lot of requests (the portal
throttles us), and a stale copy. IPTVnator does the opposite: adding a source only logs in; categories load
when you open a section; a category's titles load a page at a time while you scroll.

## The new shape

```
Add source  ->  save + log in (a second, not minutes)
Open Movies ->  load the category list (1 request), show it in the left list
Click one   ->  load page 1 of that category, then more as you scroll
Open a title -> load its details / seasons / episodes then
Press play  ->  resolve the stream address then
```

Only these stay in the database: sources, favorites, recently watched, watch progress, settings, ratings and
subtitle caches. A title is never copied in bulk. A favorite or recent item keeps the row it needs to be shown
and played later (name, poster, ids, the portal command), never a stream address.

## One browsing interface, three providers

```ts
interface Browser {
  categories(section): Promise<Category[]>
  page(section, categoryId, cursor?): Promise<{ items: Item[]; next?: Cursor; total?: number }>
  search(section, text, categoryId?, cursor?): Promise<Page>
  details(item): Promise<Details>          // seasons, episodes, plot
  resolve(item, episode?): Promise<StreamRequest>   // address, headers, mime
}
```

- **Stalker**: `get_categories` / `get_genres`, `get_ordered_list&category=…&p=…` (14 per page), `search=` for
  movies and series; live channels as today but read once per session in memory (IPTVnator does the same).
- **Xtream**: `get_vod_categories` then `get_vod_streams&category_id=…` (one category per request, sliced into
  pages on our side), same for series and live. No full download.
- **M3U**: a file has no server to ask, so it is parsed once and kept (as now). It implements the same
  interface over the stored rows, so the screens do not care.

## Screens

- **Live TV, Movies, Series** share one layout: a full-height category list on the left (search box on top, an
  "All" entry first, counts when the portal tells us), the content on the right with infinite scroll.
  - Live TV: clicking a category only filters the list; the channel that is playing keeps playing.
  - Movies and Series: clicking a category shows its titles as poster cards; opening a title shows the detail
    page; Back returns to the exact scroll position.
- A page that fails to load keeps what is on screen and shows a Retry row at the bottom; it never leaves a
  silent gap.
- While a page loads: skeleton cards (we already have them), never a spinner.
- Visual design stays TiviHub's: the category list uses the existing tab-tile look (grey tiles, active tile
  `--row-selected` with the 3px primary bar). The category list and the infinite list go into the style guide.

## What happens to the rest

| Part | Change |
|---|---|
| Home shelves, Continue watching | built from recently watched, favorites and progress (no catalog needed) |
| Global search (Ctrl+K) | searches favorites and recents locally, and the open section's provider |
| TV guide | loads programmes for the channels on screen (we already have `get_short_epg`/Xtream short EPG); portal bulk `get_epg_info` stays |
| Ratings (MDBList) | unchanged, matched per opened title |
| "Top 5 / Popular on TMDB" | needs a catalog to match against; replaced by portal-side search of the popular titles, or dropped (decision below) |
| Catalog refresh, 24 h auto refresh, "suspicious drop" check | gone for portal sources (nothing to refresh); stays for M3U |
| Stored movies/series/episodes of portal sources | removed by a one-time migration |
| Downloads, subtitles, casting, external player | unchanged |

## Phases (each ends with tests, a visual check in both themes, and a commit)

1. **Browser interface + Stalker and Xtream providers**, with tests against the mock portals. No UI change yet.
2. **Instant add**: connecting a source only logs in. Sections show the new loading states.
3. **Shared layout**: category list + infinite list component, in the style guide. Live TV first.
4. **Movies, Series**: lists, details, episodes, scroll restore.
5. **Favorites, recents, progress** keep their own row (migration of existing ones from the catalog).
6. **Search** inside a category and across a section; Ctrl+K updated.
7. **Cleanup**: remove the import pipeline and catalog tables for portal sources, migrate, update Home and Top 5.
8. **Real-portal pass** on the big portal and on the Xtream line, in the desktop app.

## Risks

- A big change to how almost every screen gets its data. Mitigation: the browsing interface lands first with tests,
  and M3U keeps working through the same interface the whole time.
- Portals differ. Mitigation: the per-portal quirks live in the provider; screens never see them.
- Portals throttle. Mitigation: four requests at a time (already in), a page per scroll step, caching pages in memory
  for the session, and no background crawling.
