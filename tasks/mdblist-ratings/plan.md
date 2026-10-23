# MDBList Ratings Integration Plan

## Goal

Add lazy, source-labeled movie and series ratings to TiviHub while preventing duplicate MDBList requests and preserving the existing local-first architecture.

## 1. Verify the MDBList integration contract

Before implementation:

- Confirm the current MDBList lookup endpoint and response shape.
- Confirm authentication and API-key requirements.
- Confirm browser and desktop request compatibility, including CORS.
- Confirm whether batch lookups are supported.
- Confirm applicable usage, attribution, and redistribution terms.
- Use mocked responses in automated tests; do not make tests depend on the live API.

Do not request ratings for the entire catalog during startup.

## 2. Add a separate ratings model

Keep the existing provider-supplied `rating` field unchanged. It is already used for catalog sorting and should not be silently replaced.

Add separate source-specific ratings, for example:

- IMDb rating and vote count
- TMDB rating and vote count
- Rotten Tomatoes critic and audience scores, if returned and licensed
- Metacritic score, if returned and licensed
- Source/provider rating
- Fetch timestamp and cache status

Ratings must be labeled by source in the UI. Do not combine scores from different providers into one unexplained number.

## 3. Use stable title identity

Ratings must not be keyed by TiviHub playlist IDs because those IDs are source-specific.

Preferred identity order:

1. IMDb ID
2. TMDB ID
3. A carefully normalized fallback consisting of title, year, and media type

The identity must include media type so a movie and series with the same title cannot collide.

A title appearing in multiple playlists should reuse the same cached rating when the external identity matches.

## 4. Add an IndexedDB ratings cache

Create a separate object store for ratings, using a stable cache key.

Suggested record shape:

```ts
interface RatingsCacheEntry {
  key: string;
  mediaType: "MOVIE" | "SERIES";
  externalIds?: {
    imdb?: string;
    tmdb?: string;
  };
  title: string;
  year?: number;
  ratings: ExternalRatings;
  fetchedAt: number;
  expiresAt: number;
  notFound?: boolean;
}
```

Recommended cache behavior:

- Fresh successful entries: return immediately without a request.
- Stale successful entries: return stale data immediately and refresh in the background.
- Missing entries: fetch once and persist the result.
- Not-found entries: cache briefly to avoid repeated failed lookups.
- Temporary failures: do not store them as permanent “no ratings” results.
- Invalid responses: report an error and keep existing provider metadata usable.

Use a database version migration that preserves all existing playlists, catalogs, favorites, library data, EPG data, and secrets.

## 5. Implement a ratings service

Create a testable service separate from React components and IndexedDB details.

Responsibilities:

- Normalize title lookup input.
- Read from the cache.
- Determine freshness.
- Call MDBList only when required.
- Parse and validate the API response.
- Save successful results.
- Return stale data when refresh fails.
- Support cancellation through `AbortSignal`.
- Avoid exposing API keys in logs or diagnostics.

The service should accept an injected fetch function or request adapter so unit tests can mock HTTP behavior without relying on global live networking.

## 6. Deduplicate and limit requests

Use an in-memory map of in-flight promises keyed by the stable ratings key.

Required behavior:

- Two simultaneous requests for the same title share one promise.
- A title is removed from the in-flight map after success or failure.
- Different titles may be fetched concurrently only up to a configured limit.
- The queue must not grow without bound while users browse quickly.
- Aborted UI work must not corrupt the cache.
- A failed request can be retried later.

Start with a conservative concurrency limit and make the value easy to change after observing the provider’s limits.

## 7. Load ratings lazily

Do not fetch ratings for every item during catalog import or application startup.

Initial behavior:

- Fetch ratings for titles on the visible movie or series page.
- Fetch ratings when opening a movie or series detail page.
- Prioritize detail-page requests over background card requests.
- Do not fetch ratings for live TV.
- Do not require ratings for playback.
- Do not use watchlist membership as the cache condition.

For large catalogs, only the visible page should be eligible for automatic card enrichment. Detail pages should always be able to request their title’s ratings if the cache is missing or stale.

## 8. Match titles to external IDs

Use IDs already present in the provider metadata when available.

For entries without IDs:

- Normalize whitespace and punctuation.
- Normalize case and diacritics.
- Preserve meaningful title information.
- Use year as a disambiguator when available.
- Include media type in the lookup.
- Avoid aggressive fuzzy matching that could assign ratings to the wrong title.
- Store the final external identity so future requests do not repeat title matching unnecessarily.

If confidence is insufficient, show the provider rating and an unavailable external-rating state rather than guessing.

## 9. Store API keys safely

If TiviHub supports user-supplied MDBList keys:

- Store the key using the existing encrypted local-secret mechanism.
- Never commit a key or bundle a shared private key in the frontend.
- Never include the key in diagnostics, exported logs, URLs, or error messages.
- Add settings UI for entering, saving, clearing, and testing the key.
- Define whether the key is included in encrypted backups or must be re-entered after restore.

If direct browser requests fail because of CORS or provider policy, stop before adding a proxy. Adding a backend or proxy would be an architectural change and must be discussed separately because TiviHub is currently local-first and has no application server.

## 10. Update the UI

Display external ratings as individually labeled values:

- IMDb
- TMDB
- Rotten Tomatoes
- Metacritic
- TiviHub/provider rating

Include vote counts where available.

Use clear states:

- Loading ratings
- Ratings unavailable
- Ratings not found
- Cached/stale data being refreshed

Ratings must never block:

- Browsing catalogs
- Opening details
- Starting playback
- Using the local library

Initially, leave the existing provider-based rating sort unchanged. Add source-specific sorting only as a separate follow-up decision.

## 11. Tests

### Provider tests

Add tests for:

- Valid MDBList movie responses.
- Valid MDBList series responses.
- Multiple rating sources in one response.
- Missing optional fields.
- Malformed payloads.
- Unexpected data types.
- Authentication failures.
- HTTP 401, 403, 429, and 5xx responses.
- Network failures.
- Request cancellation.
- Response-size protection if the provider response reader uses a size limit.
- No API key behavior.

Use the repository’s existing mocked-fetch patterns in `src/__tests__/providers.test.ts`.

### Cache and service tests

Add tests proving:

- A fresh cache hit makes zero HTTP requests.
- An expired cache entry triggers a refresh.
- Stale data is returned while a refresh is attempted.
- A temporary refresh failure preserves stale data.
- A missing title is fetched once.
- Not-found results are reused for their shorter TTL.
- Temporary errors are retryable.
- Two concurrent requests for one title make exactly one HTTP request.
- Different titles respect the concurrency limit.
- Failed requests are removed from the in-flight map.
- Abort signals do not leave permanently stuck requests.
- Movie and series keys do not collide.
- Identical external IDs reuse the same cache record across playlists.
- Ambiguous fallback matches are not persisted as confident matches.

### Storage and migration tests

Add tests proving:

- Database version migration creates the ratings store.
- Existing data survives the migration.
- Ratings cache records can be saved and read back.
- Cache records can be replaced without affecting catalogs.
- Deleting a playlist does not accidentally delete shared external ratings.
- Backup and restore behavior follows the documented API-key decision.
- Raw IndexedDB records do not expose encrypted secrets.

Use `fake-indexeddb` and the existing patterns in `src/__tests__/storage.test.ts`.

### UI tests

Add tests proving:

- Movie details show separate labeled external scores.
- Series details show separate labeled external scores.
- Cached ratings are displayed without a network request.
- Loading and unavailable states render correctly.
- Ratings errors do not prevent playback.
- Adding a movie or series to the watchlist does not trigger an unnecessary lookup.
- The UI does not request ratings for live channels.
- Reopening a title reuses the cached result.
- The existing provider rating remains available when MDBList fails.

Use the existing React Testing Library patterns in `appFlow.test.tsx` and `userActions.test.tsx`.

### Large-catalog regression tests

Use the repository’s synthetic large-catalog fixtures to prove:

- Application startup makes zero ratings requests for the entire catalog.
- Only visible or explicitly opened titles become lookup candidates.
- Queue and memory usage remain bounded.
- Ratings enrichment does not regress catalog parsing, sorting, searching, or pagination.

Do not use real provider playlists, accounts, API keys, or live network services in tests.

### End-to-end test

Add a Playwright test that:

1. Starts with a mocked MDBList response.
2. Opens a movie or series detail page.
3. Verifies one ratings request occurs.
4. Verifies the source-labeled ratings render.
5. Reloads the app.
6. Reopens the same title.
7. Verifies the cached result renders with zero additional MDBList requests.
8. Verifies a forced expiration causes one refresh.

## 12. Observability and diagnostics

Record only safe aggregate diagnostics, such as:

- Cache hit or miss.
- Cache refresh success or failure category.
- HTTP status category.
- Number of requested titles.
- Number of deduplicated requests.

Never record:

- API keys.
- Full request URLs containing credentials or keys.
- Private playlist URLs.
- User media titles unless the existing diagnostic policy explicitly permits them.

## 13. Delivery phases

### Phase 1: Foundation

- Verify MDBList contract and licensing assumptions.
- Add types and stable key generation.
- Add IndexedDB migration and ratings cache storage.
- Add provider parser and service unit tests.

### Phase 2: Detail pages

- Add lazy ratings loading to movie and series detail pages.
- Add loading, stale, unavailable, and error states.
- Add cache and UI tests.

### Phase 3: Catalog cards

- Add bounded, lazy enrichment for visible movie and series cards.
- Add in-flight deduplication and concurrency control.
- Add large-catalog regression tests.

### Phase 4: Settings and backup

- Add encrypted MDBList API-key settings if required.
- Implement and test backup behavior.
- Add safe diagnostics.

### Phase 5: End-to-end validation

- Add mocked Playwright coverage.
- Run all checks.
- Review legal, licensing, attribution, privacy, and rate-limit requirements before release.

## Acceptance criteria

The implementation is ready when:

- Revisiting a title with a fresh cached rating makes zero MDBList calls.
- Two simultaneous requests for the same title make one network request.
- The same identified title in multiple playlists reuses one cache record.
- A large catalog does not trigger a full-catalog ratings sweep.
- Stale ratings remain visible if a refresh fails.
- MDBList failures never prevent browsing, title details, or playback.
- API keys are never exposed in source, logs, diagnostics, URLs, or unencrypted storage.
- Existing catalogs, library data, favorites, EPG data, and provider ratings remain compatible.
- `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

## Implementation status (first increment)

Implemented: detail-page lazy loading for movies and series, source-labelled rating UI, IndexedDB `ratings` store (database version 3), the MDBList provider and a cache/dedupe/concurrency service, and a user-supplied API key in Settings. Not implemented: catalog-card enrichment, external-rating sorting, TV season/episode ratings, and a mocked-network E2E test (Playwright browsers are required).

### Setup

1. Create a free MDBList account and API key at mdblist.com.
2. Paste it under **Settings → External ratings**. Ratings then load when you open a movie or series.

### Privacy

- The key is encrypted with the same local AES-GCM key as other secrets and is never bundled.
- It is **not** included in backups and is cleared by a restore; re-enter it afterwards.
- MDBList requires the key as an `apikey` query parameter, so it is sent only to `api.mdblist.com` when a detail page needs a rating. Errors and diagnostics never include it.
- The request goes directly from your device to MDBList; MDBList sees your network address and the title looked up.

### Cache behavior

- Records are keyed by media type plus IMDb ID, else TMDB ID, else normalised title and year (a title with no ID and no year is never looked up). Playlist IDs are never part of the key, so one title shared across sources uses one record.
- Successful results are fresh for 7 days; "not found" results for 24 hours. Fresh hits make no request and need no API key.
- Stale results are shown immediately and refreshed in the background; if the refresh fails they stay visible. Temporary failures (network, 401/403, 429, 5xx) are never cached.
- Concurrent lookups of one title share one request; at most two requests run at once.
- Xtream catalogs supply IMDb/TMDB IDs when the provider includes them; M3U catalogs fall back to title + year via MDBList search, accepting only a single exact match.

### Known limitations

- The endpoint shapes (`/{imdb|tmdb}/{movie|show}/{id}`, `/search/{movie|show}`) follow MDBList's public API as understood during development; they could not be verified against live documentation in the build environment, so confirm them with one manual request. All provider calls go through an injectable transport (`MdblistTransport`) so a different client can replace browser `fetch`.
- If MDBList blocks browser cross-origin requests, ratings show as unavailable. No proxy or backend was added; that needs a separate architectural decision.
- The free tier is limited (about 1,000 requests/day); rate limiting appears as an unavailable state.
- Check MDBList's terms regarding attribution and storing third-party scores (e.g. Rotten Tomatoes) before commercial use.
