# Plan: improving TiviHub after v1.8.0

Branch: `feature/app-improvements`. Status: plan only, no code yet.

## How to read this

Every item says what the evidence is. **Verified** means I read the code or config in this repo. **To verify** means it is a hypothesis that Phase 0 must measure before any work starts. Effort is S (days or less), M (about a week), L (several weeks). Nothing here is committed to; the order and the open questions at the end are for you to decide.

## Where the app stands (facts)

- Desktop app: Tauri 2, React 19, Shaka Player. Storage moved to SQLite in v1.8.0.
- `src/App.tsx` is 3,012 lines with 19 `useState` and 15 `useEffect` calls. `ContentPages.tsx` is 1,452 lines and `PlaybackDialog.tsx` is 1,141.
- All catalogs are loaded into React state at startup (`reloadLocalData`). One real Xtream source is about 54k channels, 214k movies and 46k series. Pages show 24 items at a time, but filtering, sorting and search run over the full arrays in JS.
- Every provider request uses the webview's `fetch` (`xtream.ts`, `m3u.ts`, `xmltv.ts`, `mdblist.ts`, `opensubtitles.ts`, `updates.ts`). The README already says CORS can block a provider.
- `tauri.conf.json` has `"csp": null`. `capabilities/default.json` grants `fs:allow-open`, `fs:allow-remove` and `fs:allow-write` with no visible scope.
- CI (`ci.yml`) runs on Windows only. Linux and macOS are first built and tested by the Release workflow.
- No ESLint or Prettier config. Dependabot covers npm only. 39 test files (238 tests, one benchmark skipped), 1 Playwright spec, and Rust tests for storage only (none for `chromecast.rs`).
- Installers are unsigned (no signing or checksum step in the scripts or workflows). Updates are a manual download.
- Playback already has text tracks, audio-track selection, quality selection and playback speed (verified in the baseline: `tasks/baseline/results/playback-capabilities.md`). It has no custom keyboard shortcuts beyond Escape and Tab, no sleep timer, no next-episode logic and no custom Picture-in-Picture button.
- No i18n layer. Strings are hard-coded English.

## A. Security and trust

| # | Item | Why | Effort |
|---|------|-----|--------|
| A1 | Set a real Content-Security-Policy | `csp: null` means no policy at all. The app renders provider-supplied text and loads remote artwork, so an injected script would run with access to the Tauri commands. Needs a policy that still allows media, images and the provider hosts the user configures (no fixed host list is possible). | M |
| A2 | Scope or drop filesystem permissions | `fs:allow-write` and `fs:allow-remove` are granted without a scope. Confirm what they can reach (to verify) and narrow them to the download folders the user picks. | S |
| A3 | Release integrity | Publish SHA-256 checksums with each release, add build provenance (GitHub attestations), and decide on Windows code signing. Unsigned installers trigger SmartScreen warnings and give users no way to verify a download. | S (checksums) / M (signing) |
| A4 | Verified in-app updates | The update check finds a release, but the user downloads and runs the installer by hand. Options: show the checksum in the dialog, or move to `tauri-plugin-updater` with a signing key. The second one needs a key-management decision. | M |
| A5 | Credentials in other places | v1.8.0 keeps the Xtream login out of stored stream URLs. M3U stream URLs, casting URLs (README notes they can carry credentials), and diagnostics exports still need an audit for tokens. | S |
| A6 | Dependency hygiene | Add `cargo audit` and `npm audit` to CI, and Dependabot for `cargo` and `github-actions`. | S |

## B. Performance and memory, using SQLite properly

v1.8.0 only moved storage. The app still reads everything and filters in JavaScript, so SQLite is used as a file format, not a query engine.

| # | Item | Why | Effort |
|---|------|-----|--------|
| B1 | Measure first | Profile cold start, memory with the 270k-row source, filter/sort/search latency, and the Home page. The 200k-row read already shows a ~100 ms event-loop stall (mostly JSON parsing). To verify: where startup time and memory actually go. | S |
| B2 | Query on demand | Add storage commands for "page N of movies sorted by X filtered by Y" and "search titles". Keep only the visible page and counts in React. Sorting columns (year, rating, added) become real columns with indexes. | L |
| B3 | Full-text search | SQLite FTS5 over titles for global search, instead of scanning arrays. rusqlite `bundled` supports it. | M |
| B4 | Faster startup | Load only what Home needs first (continue watching, favorites), then the rest lazily. Today `ready` waits for every row of the active source. | M |
| B5 | Background refresh in Rust | Catalog refresh and XMLTV parsing in the webview compete with the UI. Moving fetch plus parse plus stage into Rust avoids shipping 200k records through `invoke` as JSON. | L |
| B6 | Remove IndexedDB from the desktop path | After a release or two, delete the old IndexedDB copy (plan decision D5) and the migration code. | S |

B2 is the biggest change and touches most pages. It should be done behind the existing storage interface with the contract suite from v1.8.0 as the safety net.

## C. Networking

| # | Item | Why | Effort |
|---|------|-----|--------|
| C1 | Native HTTP for provider API calls | Webview `fetch` fails when a provider does not send CORS headers. A Rust command can call the provider directly, with timeouts, redirect limits and size caps, and the result goes straight to the parser. Fixes the most common "my source will not load" failure. Playback itself still goes through the player, which has the same CORS limits. | M |
| C2 | Streaming parse for big files | M3U has a size cap (`MAX_M3U_BYTES`). Big XMLTV files are read fully into memory. Parse incrementally (in Rust with C1). | M |
| C3 | Retry and offline behavior | Define one policy for retries, timeouts and what the UI shows when the provider is down, instead of per-provider code. | S |
| C4 | Local stream proxy (decide first) | Would let CORS-blocked and header-requiring streams play. Large security surface (an open local port), so this needs a threat model before anyone builds it. | L, optional |

## D. Playback

All of these are small, user-visible, and contained in `PlaybackDialog.tsx`, which needs to be split first (see F).

- D1 Picture-in-Picture and a mini player.
- D2 A sleep timer. (Playback speed already exists.)
- D3 "Next episode" prompt and autoplay for series, using the library progress data that already exists.
- D4 Keyboard shortcuts (seek, volume, fullscreen, next/previous channel). `PlaybackDialog` references keyboard handling only a few times (to verify what is covered).
- D5 Removed: audio-track and quality selection already exist.
- D6 Channel zapping: last channel, number entry, and channel-list overlay while watching live TV.
- D7 Better error messages: map the common failure causes (expired account, CORS, unsupported codec, DRM) to specific text. `playbackErrorMessage` exists and can be extended.

## E. Library and product features

- E1 EPG reminders and "now/next" notifications for chosen programs.
- E2 Parental controls: an adult-content filter exists (`adultContent.ts`). Add a PIN and per-source settings.
- E3 Multiple sources as one library: merge duplicates across sources and pick the best working stream. Needs a matching rule for titles (design first).
- E4 Watchlist, "mark as watched", and "recently added" shelves.
- E5 Smarter search: filters by year, genre, rating, source; recent searches.
- E6 Import and export of favorites and playlists independent of the encrypted full backup.

Product direction matters here. Pick two or three after B and D, based on what users ask for, not all of them.

## F. Code health

| # | Item | Why | Effort |
|---|------|-----|--------|
| F1 | Split `App.tsx` | 3,012 lines of state and handlers. Extract hooks (`useLibrary`, `useCatalogRefresh`, `usePlayback`, `useDownloads`) and move page-level state into the pages. Do it incrementally, one hook per PR, keeping `appFlow.test.tsx` and `userActions.test.tsx` green. | L |
| F2 | Split `ContentPages.tsx` and `PlaybackDialog.tsx` | Same reason. PlaybackDialog first, because D builds on it. | M |
| F3 | ESLint and Prettier | None configured. Add `typescript-eslint` and `react-hooks` rules in warning mode, fix, then make them errors. | S |
| F4 | Test the untested | `chromecast.rs` and the Playwright suite (1 spec). Add component tests for playback and an E2E for add source, play, favorite. | M |
| F5 | Flaky timing | The v1.7.0 release failed on a 1 s `findBy` timeout. Audit other tight timeouts in `appFlow.test.tsx` and `userActions.test.tsx`. | S |

## G. CI and release

- G1 Run the test job on Linux and macOS as well as Windows. Today a platform-specific failure first shows up when you tag a release.
- G2 `cargo clippy -- -D warnings` and `cargo fmt --check`.
- G3 Cache Cargo and npm in CI. The harness build in `npm test` compiles Tauri from scratch on a cold runner.
- G4 Make the release a dry-run on a pull request label (build all platforms without publishing), so a tag is never the first full test.
- G5 Coverage report with a floor for `src/storage` and `src/providers` (do not set a global number).

## H. Accessibility and localization

- H1 Run an accessibility audit (keyboard-only, screen reader, contrast, reduced motion) before changing anything. The code has many `aria-` attributes (App 35, ContentPages 57), so this is an audit, not a rewrite. To verify what is broken.
- H2 Add an i18n layer (extract strings, locale files, plural and date formatting). Large mechanical change; do it only if you want non-English users. Doing it after F1 avoids moving 3,000 lines twice.

## I. Platform parity

- I1 Hand-test the Linux and macOS builds once (first launch, migration, keychain, playback). Only Windows was checked for v1.8.0.
- I2 Decide the Linux no-keychain behavior. v1.8.0 falls back to a key file. If the keychain later disappears, sealed credentials can no longer be opened. Consider telling the user and offering re-entry instead of silently generating a new key.

## Proposed order

| Phase | Work | Gate |
|-------|------|------|
| 0 | Measure and audit: B1, H1, A2, check D5 and I1 | **Done.** Findings in `tasks/baseline/findings.md`; the order below is updated from them |
| 1 | Quick wins: A3, A6, F3, F5, G1 to G3, plus the two cheap security fixes from the baseline (no HTTP cache for calls that carry the login; autofill off on the add-source form) and A2 narrowing | CI green on three platforms; checksums on a release; the credential scan shows no login in the WebView cache or autofill data |
| 2 | Code health that the next phase needs: F1 (`App.tsx`) in slices | `appFlow` and `userActions` untouched and green after every slice |
| 3 | Performance, triggered by the baseline: B2, B3, B4 (`query-engine`), then B5 with C1/C2 for refresh | Re-run the baseline: L cold start under 3 s, no long task over 200 ms in the six interactions, refresh without a UI freeze over 200 ms; contract suite green |
| 4 | Accessibility fixes (`a11y-fixes`) and security A1, A5, A4 | Axe shows no critical or serious violations on the 8 screens; CSP passes a manual run of add source, play, cast, download and update check |
| 5 | F2 (`PlaybackDialog` and `ContentPages` split), then playback features D1, D2, D3, D4, D6, D7 | Component tests plus a manual playback run |
| 6 | Product features from E, chosen with you | n/a |
| Later | H2, C4, A4 signing, B6 | n/a |

Why this order (revised after the baseline): the baseline showed a 4.6 s cold start and 265 to 545 ms UI stalls on a large library, so performance moves ahead of playback features, and the app split moves up with it because both change the same large files. Original rationale: Phase 0 prevents building on guesses. Phases 1 and 2 are cheap and reduce risk for every later release. F2/F1 come before D and B because both touch the same large files, and splitting them first keeps those later changes reviewable. B is the largest payoff for big libraries but the largest risk, so it comes after the safety nets are better.

## Risks

- **CSP (A1)** can break playback or artwork for providers on arbitrary hosts. Needs a permissive-for-media, strict-for-scripts policy and a real-source test.
- **B2** changes how every list page gets its data. Without the contract suite and E2E coverage (F4) it is easy to regress sorting, adult filtering or search ranking.
- **C1** moves requests out of the webview, so provider behavior can differ (headers, cookies, redirects). Keep the webview path as a fallback until proven.
- **F1** is a large refactor with no user-visible change. Slice it, and do not mix it with feature work.
- Scope: this plan has more than one person-quarter of work. It is a menu, not a commitment.

## Open questions

1. Who uses TiviHub now, and which of these (playback features, bigger libraries, more platforms, non-English) do they ask for? That decides Phase 4 versus Phase 5 and whether H2 happens.
2. Do you want to pay for Windows code signing, and do you want auto-update (A4) or keep manual installs?
3. Are Linux and macOS first-class, or best effort? That sets how much of G1 and I1 to do.
4. Does the browser version of the app ship to users, or only the desktop app and the landing page? If only desktop, the IndexedDB backend can go after B6, which removes the two-backend upkeep.
5. Are you open to a local stream proxy (C4)? If not, drop it from the plan.
