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
| Browse | `src/browse/` (`types`, `lists`, `live`, `movies`, `series`, `stalker`) | A source seen as categories plus pages of items: the `Browser<T>` interface, `memoryBrowser` (M3U and a portal's live channels: read once, grouped in memory), `cachedBrowser` (Xtream: one category per request, kept in `liveCategoryCache`) and `pagedBrowser` (Stalker movies and series: a batch of portal pages per request, `stalker.ts`) | Touch React |
| Providers | `src/providers/` (`m3u`, `xtream`, `stalker`, `xmltv`, `mdblist`, `opensubtitles`, `http`, `transport`) | Fetching and parsing one source into the types in `src/types.ts` | Touch storage or React |
| Storage | `src/storage/` (`database.ts` facade, `sqliteBackend`, `idbBackend`, `codec`, `migration`) | Reads/writes, encryption of secrets, backend choice | Import hooks or components |
| Services | `src/services/` (`ratingsService`, `subtitleService`, `catalogRefresh`, `downloads`, `backup`, ...) | Business rules, caching with TTLs, anything that touches storage, network or Tauri | Import React |
| Lib | `src/lib/` (`m3uIds`, `catchup`, `catalogSorting`, `playbackErrors`, `demo`, ...) | Pure helpers: no I/O, no React, easy to unit test | Touch storage, network or Tauri |
| Locales | `src/locales/` (`area.ts`, `index.ts`, one file per area: `shell`, `browse`, `library`, `detail`, `sources`, `errors`, `home`, `playback`, `misc`, `parental`, `reminders`, `multiview`, plus the Settings files `en.ts`, `nl.ts`, ...) | All user-visible text in seven languages | Anything but strings |
| Hooks | `src/hooks/` | App state and side effects (`useSources`, `useLibrary`, `usePlayback`, `useDownloads`, ...). Browsing: `useBrowse` (categories + batches of one category) wrapped by `useLiveBrowse`, `useMovieBrowse`, `useSeriesBrowse`; `useCategoryEntries` builds the category tiles | Render markup |
| Components | `src/components/` | Markup, local UI state | Call `fetch`, `invoke` or `database.ts` directly; pass data in via props or a hook |
| Backend | `src-tauri/src/` (`net`, `storage`, `chromecast`, `external_player`, `diagnostics`) | Network (CORS-free, proxy), SQLite, keychain, cast, external players | Hold UI logic |

## Rules

- **All network goes through `providers/transport.ts` / `http.ts`.** In the desktop app that calls the Rust `http_fetch`; in the browser it is plain `fetch`. Never call `fetch` from a component.
- **All persistence goes through `src/storage/database.ts`.** Never use `localStorage` for data (only tiny per-viewer hints, see `MIGRATED_HINT_KEY`, and UI preferences: theme, language, adult-content switch, the PIN record).
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

`App.tsx` (~910 lines, mostly the `App()` function) and `PlaybackDialog.tsx` (~1,090, one component) are still too big: split their hooks and sub-views out before adding to them. `ContentPages`, `DetailPages`, `LibraryPage`, `HomePage`, `CastPanel` and `SubtitlePanel` were already split from them. Any change that touches an oversized file extracts the part it touches into its own file or hook instead of growing it. New files stay under ~500 lines.

## Browsing sections (Live TV, Movies, Series)

Live TV, Movies and Series load a category list first and then items in batches. Rules for `src/browse/`, `useBrowse`, caches and counts: see the `browse` skill. Read it before touching any of them.

## Speed rules (see `testing-and-ci` for how to measure)

- Pages and dialogs not needed at startup load with `React.lazy` + `Suspense` and a `Skeleton` fallback. Shaka is already `import()`ed on first playback; keep it that way.
- Lists over ~200 rows are virtualized or paginated. Catalogs hold 200k+ titles: never `.map` a whole catalog into the DOM.
- Heavy work (parse, sort, import) runs in batches or in Rust, never in one long main-thread task.
- Images use `loading="lazy"`. Do not add a dependency over ~20 kB gzipped without a reason in the PR.
- Measure with `npm run perf:all` before and after a change that claims to be faster.
