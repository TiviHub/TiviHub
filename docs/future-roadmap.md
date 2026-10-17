# TiviHub Future Implementation Roadmap

This roadmap turns the five selected priorities into an implementation sequence. Everything below is planned work, not a claim that the features are already implemented.

## Product constraints

- Keep playlists, credentials, catalogs, playback history, and diagnostics on the user's device. TiviHub must not receive or store them on a server.
- The Windows installer is the only app distribution target. `tivihub.nl` hosts the landing page and installer download only; there is no online player at `player.tivihub.nl`.
- Provider requests go directly from the Windows app to the provider; do not add a TiviHub proxy to work around provider CORS restrictions.
- Preserve the existing IndexedDB-based local storage and encrypted backup behavior unless measurements demonstrate a specific limitation.
- Prefer explicit user control over destructive or surprising automation. In particular, do not silently remove, hide, or replace catalog entries based on a probe or refresh.
- Keep current source and playlist size limits unless a separately reviewed change is made.

## Recommended sequence

| Order | Initiative | Why now | Depends on |
| --- | --- | --- | --- |
| 1 | Playback reliability and Signal Passport | Playback failures are already blocking use; diagnose before choosing a fallback. | None |
| 2 | Large-catalog performance | Establishes a responsive foundation for all catalog workflows. | No technical dependency; sequenced after 1 to keep the first delivery focused. |
| 3 | Safe refreshes and change summaries | Protects user data and improves confidence in automatic and manual refreshes. | Current catalog storage behavior; benefits from initiative 2's performance measurements. |
| 4 | Global search and command palette | Makes the growing library easier to navigate once search can scale. | Initiative 2 |
| 5 | User-controlled stream health checks | Adds actionable diagnostics without making risky assumptions about provider behavior. | Initiative 1's diagnostic model; reuse its privacy and playback findings. |

Treat these as ordered product milestones, not fixed calendar commitments. Finish and validate one milestone before starting the next, and split any milestone that cannot be reviewed and tested independently.

## 1. Playback reliability and Signal Passport

**Goal:** Resolve the cause of playback failures such as Shaka 4032 where possible, and make remaining failures understandable without exposing user data.

**Status:** In progress. Shaka 4032 now triggers a silent native-HLS fallback for non-DRM HLS streams when the Windows app's WebView reports possible support; the previously failing stream played successfully through this path. The local report provides friendly on-screen errors and a one-click copy of sanitized playback and backend diagnostics. The reproduced HLS playlist had no declared `CODECS` attribute, while playlist and MPEG-TS responses returned HTTP 200. A fresh Windows NSIS installer build succeeded in an isolated target, and its bundled executable launched and responded using a temporary WebView2 profile. The installer was not installed; real-provider playback and broader Windows-device testing remain.

### Implementation steps

1. Build a repeatable playback test matrix for the Windows installer and representative stream types. Include the known HLS/MPEG-TS case, WebView-native supported formats, and unsupported or malformed inputs.
2. Capture only the local facts needed to explain a failure: player error code, detected manifest/container/codec information when available, and WebView/device capability results. Distinguish observed facts from guesses.
3. Trace the failure through manifest parsing, Shaka capability checks, and transmuxing before choosing a fix. Add a fallback only when tests show it is safe and compatible; do not assume every 4032 has the same cause.
4. Add a **Signal Passport** view that summarizes the local diagnostic facts in plain language. Let the user inspect the report before copying or exporting it. Redact playlist URLs, credentials, tokens, channel/program names, and other provider-specific identifiers.
5. Add focused tests for error classification, report redaction, and each supported playback path. Use synthetic fixtures rather than real subscriber playlists or credentials.

### Acceptance criteria

- The original failing case has a documented, reproducible test or is clearly identified as provider/device-specific and not fixable by TiviHub.
- Supported test streams play in the environments claimed by the app; unsupported cases show a specific, actionable explanation.
- A report generated from a fixture containing credentials and private URLs contains none of those values.
- Diagnostics are generated and handled locally; no report, stream URL, or credential is sent to TiviHub.
- No native player or extra runtime is added unless a measured compatibility gap justifies its maintenance and packaging cost.

## 2. Large-catalog performance

**Goal:** Keep importing, searching, sorting, and browsing responsive for large M3U and Xtream catalogs without raising memory use unnecessarily.

**Status:** Core acceptance checks met in Edge 155; broader low-end and packaged-WebView profiling remains useful. Added a reproducible synthetic M3U/catalog benchmark at 10,000 and 50,000 items. On the current Windows/Vitest run, year sorting improved from 84.89 ms to 5.32 ms at 10,000 items and from 438.55 ms to 30.51 ms at 50,000 items by precomputing sort keys and reusing an `Intl.Collator`. The filter benchmark measured about 0.2–1.2 ms, but is not a browser UI measurement. M3U parsing now processes 256 Ki-character chunks and yields to the event loop, avoiding an extra full-size UTF-8 buffer and the full `split()` line array. In Edge 155, 10,000/50,000-item parses took 25/197 ms while timer callbacks continued, and 50,000-item sorting took 32 ms. A 50,000-entry, 4.5 MB parse showed about 18 MB of sampled heap growth in `performance.memory`; this is not a process peak or packaged-WebView measurement. With 10,000 catalog items, the Movies page opened in 85 ms and rendered 24 cards. A repeated real UI search test measured p50 12 ms, p95 19 ms, and 74 ms maximum across 30 queries. The sampled JavaScript heap after loading was 15.6 MB. Catalog and episode records now share a single IndexedDB transaction; writes skip deleting records whose IDs are retained and run in batches of 1,000 with progress callbacks. In Edge 155, a 10,000 full-record synthetic movie import measured 6.8 seconds with 4 ms maximum timer lag; a replacement measured 13.2 seconds on its first pass and 3.6–3.7 seconds on two warm passes, with 2–5 ms timer lag. An earlier 50,000 full-record run took about 60 seconds per write pass. These timings are highly variable and workload/device-specific. The source dialog shows parsing/saving stages and can cancel network fetches or parsing; cancellation is disabled while writes are in progress. Xtream catalog fetching is bounded to six fixed requests in parallel; a regression test verifies short guide fetching never exceeds four concurrent channel requests.

### Implementation steps

1. Add reproducible synthetic catalog fixtures and record baseline import time, peak memory where measurable, search latency, sort latency, and render behavior at 10,000 items and a larger stress size.
2. Profile before changing architecture. Identify time and allocations spent in parsing, Xtream request fan-out, IndexedDB writes/reads, filtering, sorting, and rendering.
3. Move expensive M3U parsing off the UI thread where the memory cost is acceptable. Otherwise, use incremental/chunked processing that yields to the event loop so a maximum-size playlist does not need extra full in-memory copies.
4. Bound concurrent Xtream requests and write catalog records in batches. Preserve cancellation and surface individual request failures instead of disguising partial imports as complete results.
5. Use IndexedDB indexes or in-memory indexes where profiling supports them. Virtualize long result lists so the UI does not render every item at once.
6. Keep sorting and search semantics—including adult-content settings and the default latest-added sort—consistent with existing behavior.

### Acceptance criteria

- On the agreed 10,000-item test dataset, local search completes in under 100 ms at p95 after data is loaded.
- Import and sort activity does not freeze the interface; progress and cancellation remain usable.
- The stress test verifies bounded request concurrency and that failed or cancelled imports do not appear successful.
- Existing sorting/filtering tests pass, with added cases for large and incomplete records.
- Measured memory and import-time results are recorded before and after; do not adopt a database migration without evidence it is needed.

## 3. Safe refreshes and change summaries

**Goal:** Never replace a useful cached catalog with an incomplete or suspicious refresh without explaining the risk and getting the required user confirmation.

**Status:** Implemented; broader browser/manual-refresh coverage remains. Refresh data is parsed into an in-memory candidate and checked for source ownership and duplicate IDs before writes. Multi-signal drop detection flags an empty replacement or a large proportional/absolute category drop for review; it is a prompt, not a claim that provider data is invalid. Background refreshes pause on suspicious drops and keep the previous catalog. Manual refreshes show added/removed counts and let the user keep the old catalog or apply the candidate; they can retry from Refresh afterward. Ordinary updates apply without interruption. Catalog records and successful refresh metadata are committed together in one IndexedDB transaction, which is explicitly aborted on a failed write; regression coverage injects an uncloneable record and confirms the prior catalog and success timestamp remain intact. Xtream refreshes preserve locally cached episodes because those are fetched on demand. Source settings show the last successful time, latest attempt outcome, and change summary. Refreshes also verify the source was not removed or reconfigured while its request was in flight. Empty, large-drop, normal-small-change, ownership, duplicate-ID, and failed-transaction cases have focused tests.

### Implementation steps

1. Define refresh states explicitly: fetching, validating, ready to apply, applied, cancelled, and failed. Keep the previous catalog available until a replacement is accepted and committed.
2. Fetch and parse into temporary/staged data, then validate basic integrity such as source identity, parse success, and reasonable catalog counts before changing the active catalog.
3. Detect unusually large drops compared with the last successful refresh. Present the proposed added/removed counts and let the user keep the old catalog, apply the new one, or retry. Do not use a single hard-coded threshold as proof that a provider response is invalid.
4. Apply an accepted refresh using the safest transaction or generation-switch pattern supported by the current IndexedDB schema. Handle app closure, cancellation, quota errors, and failed writes without losing the last good catalog.
5. Show last successful refresh time, outcome, and a concise change summary. Keep manual refresh available and preserve the existing 24-hour automatic refresh policy.

### Acceptance criteria

- A parse, network, quota, cancellation, or application failure leaves the last good catalog usable.
- A simulated suspicious drop is identified and presented for user decision; normal small changes refresh without unnecessary friction.
- Refresh status and last-successful-refresh time remain accurate after reload.
- Tests cover complete, partial, empty, interrupted, and failed refreshes, including app termination between staging and activation where practical.

## 4. Global search and command palette

**Goal:** Find content across Live TV, Movies, and Series quickly, and make frequent navigation/actions available without hunting through tabs.

**Status:** Implemented and smoke-tested in Edge 155. The top-bar search opens from a visible control or Ctrl/Command+K. The local dialog searches the active catalog, groups up to eight results per content type, observes adult-content visibility, and opens movies, series, or live playback through their existing surfaces. Quick actions navigate sections, add a source, or start a refresh. Escape, arrow navigation, tab focus containment, and focus restoration are supported; queries exist only in component state and are not persisted or logged. On a synthetic 10,000-movie catalog, 30 real UI searches measured p50 15 ms, p95 19 ms, and 22 ms maximum. Desktop keyboard and mouse navigation were smoke-tested; responsive narrow-width behavior was also checked but is not a supported platform.

### Implementation steps

1. Define a shared local search model over the catalog types, with clear result labels and navigation back to the correct detail or playback surface.
2. Reuse the indexes and search behavior established in initiative 2 rather than adding a second unbounded full-catalog scan.
3. Add an accessible global search entry point and keyboard shortcut for Windows desktop. Keep the visible control usable with a mouse and keyboard.
4. Add a compact command palette for safe navigation and actions such as opening sections and starting a refresh. Require confirmation for actions that can replace or remove data.
5. Apply existing adult-content visibility settings consistently to search results. Do not log search queries or send them outside the device.

### Acceptance criteria

- A query returns matching items from all enabled catalog types and opens the correct destination.
- Results honor the adult-content setting and other applicable visibility rules.
- Search is keyboard accessible, screen-reader labeled, and usable on narrow screens without requiring a keyboard.
- Search stays under the initiative 2 latency target on the 10,000-item dataset.
- Search terms and command history are not transmitted or retained beyond the existing local application behavior.

## 5. User-controlled stream health checks

**Goal:** Help users identify likely unavailable streams while being honest about the limits of automated network checks.

### Implementation steps

1. Offer an explicitly started, cancellable check for the currently selected channel group. Individual stream health is determined by the user's playback attempt; do not add a redundant preflight button to each channel.
2. Classify results as **available**, **unavailable**, or **inconclusive**. A CORS/network denial, access denial, timeout, or ambiguous HTTP 200 response must not be treated as definitive proof of playback health.
3. Keep checks local and transient. Do not store or log full URLs, credentials, or results.
4. Show results as advisory information only. Never automatically hide, delete, reorder, or replace a channel because of a check.
5. Defer duplicate grouping and user-confirmed failover until accuracy is measured across providers. Require review and explicit confirmation before saving any group or preference.

### Acceptance criteria

- Checks can be started and cancelled, have bounded concurrency, and clearly report progress.
- Results distinguish a confirmed HTTP/network response from actual successful playback; uncertain outcomes remain inconclusive.
- The check never changes catalog visibility or content without an explicit user action.
- Provider URLs, credentials, and check results are not sent to a TiviHub service.
- Tests cover timeout, blocked method, HTTP error, HTTP 200 with unplayable content, and cancellation cases.

**Status:** Explicit checks are available for the selected channel group; individual channels are checked through normal playback and its existing diagnostics. Group runs use a fixed concurrency of three, show incremental progress and per-channel results, and can be cancelled. Each check sends a small byte-range request directly from the app's WebView to the provider, omits browser cookies, cancels unread response bodies, and times out after eight seconds. Results do not change the catalog or persist. CORS/network failures, access denial, timeout, and non-media HTTP 200 replies remain inconclusive; a recognized media reply still does not prove device playback. Broader packaged-WebView/provider testing remains future work.

## Release gates

Before shipping each milestone:

1. Run focused unit tests and the TypeScript/build checks for the affected surfaces.
2. Verify the Windows installer, packaged WebView behavior, and landing-page installer download path.
3. Test the relevant mouse, keyboard, and accessibility flows, including supported Windows touch-screen devices.
4. Confirm local-only data handling, including network requests and diagnostic exports.
5. Update the user-facing help or release notes with changed behavior, known limitations, and recovery steps.

## Explicitly out of scope for this roadmap

- Hosting user catalogs, credentials, playback history, or diagnostics on a TiviHub backend.
- Adding a server-side proxy to bypass provider CORS or access controls.
- Automatically deleting, hiding, or replacing streams based on refresh or health-check results.
- Stalker/Ministra support, a bundled MPV sidecar, or a storage-engine migration. Revisit these only after the roadmap's reliability and performance measurements show a clear user need.
