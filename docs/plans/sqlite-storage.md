# Plan: move desktop storage from IndexedDB to SQLite

Branch: `feature/sqlite-storage`. Status: Phases 0-4 implemented (`ba7384b`); open gates below.

Decided: D3 keychain accepted, D4 web build keeps IDB, T3 parity binary dropped (T2 plus the migration tests cover Rust and the JS side separately).

Still open before merge:
- T1 contract suite: `storage.test.ts` only runs against `idbBackend`.
- T4: IDB seeds at schema v1/v3/v5, write during migration, and the raw-file plaintext check are not covered. Mid-migration crash and partial-store cases are.
- T5: only the corrupt-file case is covered (Rust test); read-only dir and full disk are not.
- T6: Rust side measured (`catalog_import_speed`, release): 200k channels import 1.4s, cold read 0.19s. Not measured: invoke/JSON transfer from the webview and an IDB baseline, so the "no more than 20% slower" comparison is still open.
- T7 manual Windows upgrade/downgrade run has not been done.
- Keychain-unavailable fallback (Linux) is undecided.

## Goal and scope

The desktop (Tauri) app stores its data in SQLite in the app data dir instead of the webview's IndexedDB. Existing users keep every playlist, credential, favorite, and cache entry. The webview can no longer silently wipe the user's data.

In scope: everything in `src/storage/database.ts` (db `tivihub-web`, v6, 15 stores).

Out of scope, on purpose:
- `src/downloads.ts` (db `tivihub-downloads`). It holds multi-GB Blobs and directory handles. SQLite is the wrong place for them.
- `localStorage` (theme, home layout, diagnostic logs). Tiny, not at risk.
- The browser/web build, if it ships. It keeps IndexedDB (see D4).

## Facts that shape the design

1. **The credential key cannot be moved.** Playlist URLs and passwords are AES-GCM encrypted with a non-extractable `CryptoKey` stored in IDB (`keys` store). It cannot be exported, so SQLite cannot reuse it.
2. **The code uses real transactions** (`saveCatalog`, `deletePlaylist`, `restoreSnapshot`, `replaceEpg*`). `tauri-plugin-sql` (sqlx pool) cannot guarantee BEGIN..COMMIT across separate `invoke` calls.
3. **The public API is ~40 functions in one file.** Every caller and test goes through it. That is the seam.

## Decisions (recommended, need your sign-off)

| # | Decision | Recommendation | Why |
|---|----------|----------------|-----|
| D1 | SQLite access | `rusqlite` (feature `bundled`) behind Tauri commands, one `Mutex<Connection>` | Real transactions, batched writes, no JS SQL layer |
| D2 | Schema | One table per store: `(id, playlist_id, json)` plus indexed columns only where IDB has an index (`byPlaylist`, `bySeries`, `byChannel`, `bySource`) | Types in `src/types.ts` stay untouched; no column-per-field rewrite |
| D3 | Credential encryption | Rust encrypts with AES-GCM; key kept in the OS keychain (`keyring` crate) | Only way to keep credentials encrypted at rest and off the webview |
| D4 | Web build | Keep IDB behind the same interface; pick the backend with `isTauri()` | Avoids breaking the web build. Costs a second backend to keep in parity |
| D5 | Old IDB data | Copy, never move. Delete only one release later | A bad migration stays recoverable |

If D3 is rejected, the fallback is to leave the key in IDB and store only ciphertext in SQLite. That keeps IDB as a single point of failure, so it is not recommended.

## Architecture

```
callers / tests (unchanged)
        |
src/storage/database.ts      same exports, delegates to a Backend
   |-- idbBackend.ts         today's code, moved as is
   `-- sqliteBackend.ts      invoke("storage_*")
                                  |
src-tauri/src/storage.rs     rusqlite, WAL, PRAGMA user_version migrations
```

Transactions: every command is one self-contained transaction. There is no begin/commit split across `invoke` calls, because a webview reload between them would leave a transaction open and let unrelated commands join it.

Catalog writes: `saveCatalog` already writes in 1000-row batches. Send one `invoke` per batch into a staging table per store (for example `channels_staging(generation, id, json)`), never into the live tables, because `id` is the live primary key and a same-id row would overwrite the old one in place. A final `storage_finish_catalog(playlist, generation, sourceUpdate?, includeEpisodes)` does everything `saveCatalog` does today, in one transaction:
- fail if the playlist no longer exists ("source was deleted before its refreshed catalog could be saved"),
- write `sourceUpdate` if given,
- replace the live rows from staging and delete live rows not in staging,
- leave episodes alone unless `includeEpisodes`.

A crash before it leaves the old catalog fully intact. Leftover staging rows are deleted at startup. Measure batch size against gate G3.

## Migration (IDB -> SQLite), first launch after update

0. **Runs at startup, before the app reads or writes any storage.** `database.ts` waits for it, so the background catalog refresh cannot write to IDB mid-copy. Show `StartupScreen` with `ProgressIndicator`, one step per store.
1. Skip if SQLite `meta.migrated_from_idb = 1`. Skip if no IDB db exists (fresh install), checked with `indexedDB.databases()` before opening anything.
2. **No plaintext backup.** `createSnapshot()` decrypts credentials, so its output must never be written unencrypted. IDB itself stays untouched (D5) and is the backup. If a file backup is wanted, write it through `encryptBackup`, and delete it once step 5 passes.
3. Read each IDB store. Decrypt playlists with the old key and send plaintext to Rust, which re-encrypts with the keychain key (D3). Copy everything else as is. A playlist that cannot be decrypted (missing or mismatched key) is copied with its metadata and empty credentials, flagged "needs re-entry", and counted as expected in step 5. It must not block the migration.
4. One SQLite transaction per store. Do not set the flag yet. A crash here means the next launch redoes the copy; inserts are `INSERT OR REPLACE`, so re-running is safe.
5. **Verify, then flip.** For every store, compare contents read directly from IDB and SQLite (not `createSnapshot()`, which skips the MDBList key, `secrets`, and the ratings/popular/rate-limit/subtitle caches). Row counts must match, and every playlist plus the OpenSubtitles and MDBList API keys must decrypt to the same values as the IDB copy. On any mismatch: wipe the SQLite data tables (they are only copies), leave the flag unset, keep using IDB, log a diagnostic event. Only after verification passes, a separate final transaction sets `meta.migrated_from_idb = 1`.
6. Leave the IDB db in place. A later release deletes it, only if `migrated_from_idb = 1` and the app has run on SQLite cleanly at least once.

Failure behavior:
- Not yet migrated and SQLite cannot open: use IDB for that session and show a diagnostic.
- Already migrated and SQLite cannot open: do not fall back to IDB (it is a stale copy, and writes there would be lost). Show an error with retry only, plus one explicit button, "Open old copy (read-only, may be out of date)", that opens IDB read-only.
- Either way the app never starts empty over existing data.

## Test plan

**T1. Contract suite (TS).** Extract today's `storage.test.ts` cases into a suite that takes a backend. It runs against `idbBackend` (fake-indexeddb) now and against the Rust backend in T3. Existing UI tests (`appFlow`, `userActions`, `catalogImportFlow`, ...) must pass untouched.

**T2. Rust unit tests** (`cargo test`, in-memory SQLite). One test per command: round trip, upsert, delete by playlist, index queries, `user_version` upgrade from each older schema version, transaction rollback on a mid-batch error, `PRAGMA integrity_check`.

**T3. Backend parity.** `sqliteBackend.ts` takes its `invoke` function as a parameter. A small Rust test binary reads JSON commands on stdin and writes results to stdout; vitest passes an `invoke` that talks to it. The T1 suite then runs against the real Rust code with the same fixtures (playlists with credentials, 3 playlists of mixed channels/movies/series/episodes, EPG, favorites, caches), and both backends must give identical `createSnapshot()` output. This covers backup/restore only; store-level equality is checked in T4. If the test binary proves too costly, drop T3 and rely on T2 plus T7.

**T4. Migration tests (most important):**
- Seed fake-indexeddb at schema v1, v3, v5 and v6 shapes; migrate; assert per-store equality for all 15 stores, including the MDBList key and the caches.
- Trigger an IDB write while the migration runs; assert it is blocked or applied, never lost.
- Credentials: seed with a real generated `CryptoKey`; assert plaintext matches after migration, and that the raw SQLite file contains no plaintext password.
- Kill mid-migration (throw after store N); relaunch; assert full completion and no duplicates.
- Re-run on an already-migrated db; assert no-op.
- Inject a count mismatch; assert the flag stays unset and the app stays on IDB.
- Empty IDB, and IDB with only some stores.
- Delete the IDB encryption key, then migrate; assert the playlists arrive flagged "needs re-entry" and the migration still completes.
- Crash between catalog batches and `storage_finish_catalog`; assert the old catalog is intact (no mix of old and new rows) and staging rows are removed on restart.
- Delete the playlist while a catalog refresh is staged; assert `storage_finish_catalog` fails and the deleted playlist's rows do not return.
- Inject a verification mismatch; assert the SQLite tables are wiped, the flag stays unset, and the app still reads IDB.
- After migration, import the storage module and assert IndexedDB is never opened.
- No plaintext credentials on disk: after migration, grep the app data dir (including any backup file) for the test password.

**T5. Failure injection.** Unreadable SQLite file, read-only dir, full disk, corrupt header. Expected: the fallback rules in "Failure behavior" and a visible diagnostic. Never an empty app. Includes the already-migrated case, which must not fall back to IDB.

**T6. Performance (gate G3).** Reuse `catalogPerformance.test.ts`. Import 200k channels and 50k movies. Targets: no more than 20% slower than IDB on import and cold read, and no UI freeze above 100 ms. If missed, change the batching before going further.

**T7. Manual run on a real build (Windows first).** Install v1.7.0 and create data (Xtream playlist with credentials, M3U, favorites, subtitle cache). Upgrade to the branch build and confirm everything survives. Upgrade again. Downgrade to 1.7.0 and confirm it still opens its untouched IDB.

## Phases and gates

| Phase | Work | Gate to continue |
|-------|------|------------------|
| 0 | Extract `Backend` interface, move IDB code to `idbBackend.ts` and make it open lazily (today `openDB` runs at import, `database.ts:93`, which creates an empty IDB on fresh installs), build the T1 contract suite | All existing tests green, zero behavior change |
| 1 | `storage.rs`: schema, commands, T2, `cargo test` step in `ci.yml` | `cargo test` green in CI |
| 2 | `sqliteBackend.ts` plus backend switch on `isTauri()`; T1 and T3 against SQLite | Parity green, G3 performance met |
| 3 | Keychain encryption (D3) | Credential tests and raw-file plaintext check pass |
| 4 | Migration and fallback; T4 and T5 | All migration tests green |
| 5 | T7 on Windows, then Linux/macOS builds via CI | Signed off before merging |
| 6 | Release with IDB kept; one release later, delete old IDB | n/a |

CI: `ci.yml` has no `cargo` step today. Add `cargo test` in Phase 1 as a required check.

## Risks

- **Keychain unavailable** (some Linux setups without a secret service): D3 fails. Mitigation: detect at startup and either fall back to a permission-restricted key file with a diagnostic, or block saving credentials with a clear message. Decide before Phase 3.
- **Parity drift** between the two backends (D4). Mitigated by the shared contract suite. If the web build is not shipped, drop D4 and the IDB backend after migration.
- **Downgrade** after migration: users who go back to an older version see old IDB data and lose changes made on SQLite. Acceptable; document in release notes.
- **Backup/restore** (`encryptBackup`, `restoreSnapshot`) must keep working across backends. Covered by T3.

## Open questions

1. Is the web build shipped to users, or only the desktop app?
2. Accept D3 (OS keychain)? Which platforms must be supported on day one?
3. Is deleting the old IDB after one release OK, or keep it indefinitely?
