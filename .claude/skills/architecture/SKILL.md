---
name: architecture
description: How TiviHub is built and where code goes. Use before adding a feature, a provider, a hook, a Tauri command, or moving code between layers.
---

# TiviHub architecture

Tauri 2 desktop app. React 19 + Vite 8 + TypeScript in `src/`, Rust in `src-tauri/src/`. One app, one `package.json`: do not turn it into a monorepo.

## Layers (data flows one way)

```
providers/*  ->  storage/*  ->  hooks/*  ->  components/*  ->  App.tsx
(parse, fetch)   (persist)      (state)      (render)           (wiring)
```

| Layer | Path | Owns | Must not |
|---|---|---|---|
| Browse | `src/browse/` (`types`, `lists`, `live`, `movies`, `series`) | A source seen as categories plus pages of items: the `Browser<T>` interface, `memoryBrowser` (M3U and a portal's live channels: read once, grouped in memory), `cachedBrowser` (Xtream: one category per request, kept in `liveCategoryCache`) and `pagedBrowser` (Stalker movies and series: a batch of portal pages per request, `stalker.ts`) | Touch React |
| Providers | `src/providers/` (`m3u`, `xtream`, `stalker`, `xmltv`, `mdblist`, `opensubtitles`, `http`, `transport`) | Fetching and parsing one source into the types in `src/types.ts` | Touch storage or React |
| Storage | `src/storage/` (`database.ts` facade, `sqliteBackend`, `idbBackend`, `codec`, `migration`) | Reads/writes, encryption of secrets, backend choice | Import hooks or components |
| Services | `src/services/` (`ratingsService`, `subtitleService`, `catalogRefresh`, `downloads`, `backup`, ...) | Business rules, caching with TTLs, anything that touches storage, network or Tauri | Import React |
| Lib | `src/lib/` (`m3uIds`, `catchup`, `catalogSorting`, `playbackErrors`, `demo`, ...) | Pure helpers: no I/O, no React, easy to unit test | Touch storage, network or Tauri |
| Hooks | `src/hooks/` | App state and side effects (`useSources`, `useLibrary`, `usePlayback`, `useDownloads`, ...). Browsing: `useBrowse` (categories + batches of one category) wrapped by `useLiveBrowse`, `useMovieBrowse`, `useSeriesBrowse`; `useCategoryEntries` builds the category tiles | Render markup |
| Components | `src/components/` | Markup, local UI state | Call `fetch`, `invoke` or `database.ts` directly; pass data in via props or a hook |
| Backend | `src-tauri/src/` (`net`, `storage`, `chromecast`, `external_player`, `diagnostics`) | Network (CORS-free, proxy), SQLite, keychain, cast, external players | Hold UI logic |

## Rules

- **All network goes through `providers/transport.ts` / `http.ts`.** In the desktop app that calls the Rust `http_fetch`; in the browser it is plain `fetch`. Never call `fetch` from a component.
- **All persistence goes through `src/storage/database.ts`.** Never use `localStorage` for data (only tiny per-viewer hints, see `MIGRATED_HINT_KEY`).
- **New Tauri command:** write it in the right `src-tauri/src/*.rs` module, register it in `main.rs`, add its capability in `src-tauri/capabilities/`, wrap it in one typed TS function in the layer that owns it. Commands return `Result<T, String>`; the TS side shows the message, never swallows it.
- **Credentials never sit in plain stored URLs.** See `src/storage/credentialUrls.ts` (`redactUrl`, `hydrateUrl`, `withoutCredentialUrls`) and the `secrets` store.
- **Local-first.** No TiviHub server, account, analytics or proxy (see `CONTRIBUTING.md`).
- **State:** React state + the hooks above. Do not add a state library. A value used by one component stays in that component; lift it only when two need it.
- **Browser mode and desktop mode both work.** Anything desktop-only (Stalker, downloads folder, cast, external player) checks `isTauri()` and degrades visibly.
- **Where new code goes:**
  - parser for a new source type -> `src/providers/<name>.ts` + a test in `src/__tests__/`
  - new persisted thing -> see the `database` skill
  - new screen -> `src/components/<Name>Page.tsx`, state in a hook, route wired in `App.tsx`. A screen with a list on the left and content beside it is built from `BrowseShell` + `NavPanel` / `BrowseCategoryList`, never its own page header and layout (see the `ui` skill); add its route to the `main-content--browse` condition in `App.tsx`
  - new browsable section -> a `Browser<T>` in `src/browse/`, a hook over `useBrowse`, rendered by `CatalogBrowsePage` (posters) or the Live TV page
  - shared UI piece -> `src/components/common.tsx` and the style guide (see the `ui` skill)
  - pure helper -> `src/lib/<name>.ts`; anything with I/O -> `src/services/<name>.ts`; styles -> `src/styles/`. Keep `src/` root to `main.tsx`, `App.tsx`, `types.ts`.

## Size limits

`App.tsx` (~860 lines, mostly the `App()` function) and `PlaybackDialog.tsx` (~1,100, one component) are still too big: split their hooks and sub-views out before adding to them. `ContentPages`, `DetailPages`, `LibraryPage`, `HomePage`, `CastPanel` and `SubtitlePanel` were already split from them. Any change that touches an oversized file extracts the part it touches into its own file or hook instead of growing it. New files stay under ~500 lines.

## Browsing sections (Live TV, Movies, Series)

- **Do not download a whole catalog to show a section.** Categories first, then the items of the chosen one a batch (`BROWSE_PAGE_SIZE`) at a time as you scroll. Xtream has no "All" (it is a full download); M3U and portals do.
- `useBrowse` stores each answer with the key it was loaded for (browser, category, query, sort), so a stale answer is never shown. Keep that when changing it.
- **Counts are shown only when true:** a count the source sent; the exact count of the live channels stored on this device (every source imports all of them); the counts from the provider's "everything" answer (below); or the total of a category opened this session. Never derive a count from stored movies or series (partial, so it shows wrong "0"s), and never show 0 for "unknown". Live TV, Movies and Series all use `useCategoryEntries`.
- **Cache rules (one place: `cachedBrowser` in `src/browse/lists.ts`, rows via `src/services/browseCache.ts`):** a stored answer opens at once and is refreshed behind it; a different fresh answer is announced (`Browser.subscribe`) and `useBrowse` swaps the open list to it, unless you have scrolled past the first batch. A stored answer older than `BROWSE_CACHE_MAX_AGE_MILLIS` (7 days) is fetched first and still used if that fails. Within a session each answer is asked for once. Search, sort and the chosen category are never cached and reset per section (`key={section}` on `CatalogBrowsePage`).
- **The "everything" answer (Xtream movies and series).** Once the category list is known, `cachedBrowser` asks for every item in one request behind the screen (`all` in its source). The answer gives each category its count and its items (clicks are then instant), is stored under the `@@all` key and merged into App state (search finds everything), and the category list is announced again with counts. Until it arrives, a clicked category is fetched on its own. Adding a source stays fast because none of this blocks it.
- **A Stalker portal pages, it does not download.** A portal gives 14 titles per request and has no "everything" call, so `pagedBrowser` (`src/browse/lists.ts`) reads a batch of 5 portal pages at a time; its cursor is the portal's page number, search and A–Z sorting are done by the portal (`search`, `sortby`), and "All" is the portal's `*` category. Z–A is not offered by portals and falls back to newest first. Category counts are read in the background (one `total_items` request per category, two at a time, stored with the category list for 7 days) and announced through `subscribe`; series counts are only shown when the portal has a series library of its own, because the video library's totals include movies. Adding a source imports live channels only (`loadStalkerCatalog`); like Xtream, browsed titles are stored and kept across refreshes (`keepBrowsedTitles`). The portal request gate (4 at a time) is shared, so counts never starve opening a category.
- **A shared request is never tied to one caller's signal.** The category list and each category are requested once and shared; a caller that gives up (a screen replaced, React strict mode re-running an effect) only stops waiting (`abortable` in `src/browse/lists.ts`). Passing the first caller's signal to the provider hands its AbortError to everyone who asks next, and the screen shows skeletons forever.
- **Nothing on screen disappears while it refreshes.** A refreshed category list keeps the counts shown before (`cachedBrowser` carries them over, and compares categories without their counts); when a hook builds a new browser for the same source (its stored data was reloaded), `useBrowse` keeps showing the old browser's categories and items until the new one answers (`sourceKey`). Only a different source starts clean.
- **Hooks that build a browser take `useStableSource(source)`,** not the source from App state: App rebuilds its source objects on every local-data reload, and a new object means a new browser, a lost cache and skeletons again.
- **M3U entries are classified by their address first** (`/movie/`, `/series/`, `/live/` after the host), then by group-title keywords. Group names of real providers ("|NL| NETFLIX") say nothing about the kind.
- **What an Xtream source imports:** login details and the live channels (`loadXtreamLiveCatalog`) only. Movies and series are read behind the screen (all at once, see above) or per category; each answer is also stored (`saveBrowsedMovies` / `saveBrowsedSeries`) and merged into App state (`onFetched`), so favorites, library, Home and search find what you have seen. A refresh replaces live only and keeps stored movies and series (`keepBrowsedTitles`). `loadXtreamCatalog` (everything at once) exists for tests and perf scripts only.
- Playing a channel from anywhere (Home, Library) goes to the Live TV page; only movies and episodes use the floating player.

## Speed rules (see `testing-and-ci` for how to measure)

- Pages and dialogs not needed at startup load with `React.lazy` + `Suspense` and a `Skeleton` fallback. Shaka is already `import()`ed on first playback; keep it that way.
- Lists over ~200 rows are virtualized or paginated. Catalogs hold 200k+ titles: never `.map` a whole catalog into the DOM.
- Heavy work (parse, sort, import) runs in batches or in Rust, never in one long main-thread task.
- Images use `loading="lazy"`. Do not add a dependency over ~20 kB gzipped without a reason in the PR.
- Measure with `npm run perf:all` before and after a change that claims to be faster.
