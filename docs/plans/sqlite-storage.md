# Plan: move desktop storage from IndexedDB to SQLite

Branch: `feature/sqlite-storage`. Status: plan, no code yet.

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

Batching: `saveCatalog` already writes in 1000-row batches. Send one `invoke` per batch inside one Rust transaction (`storage_begin` / `storage_commit` on the single connection). The alternative is one command taking the whole catalog, which is a large IPC payload. Measure first (gate G3).

## Migration (IDB -> SQLite), first launch after update

1. Skip if SQLite `meta.migrated_from_idb = 1`. Skip if no IDB db exists (fresh install).
2. **Safety export first.** Run `createSnapshot()` and write it to `<appdata>/pre-sqlite-backup.json`. Abort the migration if the write fails.
3. Read each IDB store. Decrypt playlists with the old key and send plaintext to Rust, which re-encrypts with the keychain key (D3). Copy everything else as is.
4. One SQLite transaction per store. The last transaction also sets `meta.migrated_from_idb = 1`. A crash before then means the next launch redoes it; inserts are `INSERT OR REPLACE`, so re-running is safe.
5. **Verify before flipping.** Per-store row counts must match, and every playlist must decrypt to the same url/username/password as the IDB copy. On any mismatch: roll back, leave the flag unset, keep using IDB, log a diagnostic event.
6. Leave the IDB db in place. A later release deletes it, only if `migrated_from_idb = 1` and the app has run on SQLite cleanly at least once.

Failure behavior: if SQLite cannot open (corrupt file, locked, disk full), the app falls back to IDB for that session and shows a diagnostic. It never starts empty over existing data.

## Test plan

**T1. Contract suite (TS).** Extract today's `storage.test.ts` cases into a suite that takes a backend. It runs against `idbBackend` (fake-indexeddb) now and against the Rust backend in T3. Existing UI tests (`appFlow`, `userActions`, `catalogImportFlow`, ...) must pass untouched.

**T2. Rust unit tests** (`cargo test`, in-memory SQLite). One test per command: round trip, upsert, delete by playlist, index queries, `user_version` upgrade from each older schema version, transaction rollback on a mid-batch error, `PRAGMA integrity_check`.

**T3. Backend parity.** A shared JSON fixture set (playlists with credentials, 3 playlists of mixed channels/movies/series/episodes, EPG, favorites, caches) runs through the TS contract suite and through Rust tests. Both must produce identical `createSnapshot()` output.

**T4. Migration tests (most important):**
- Seed fake-indexeddb at schema v1, v3, v5 and v6 shapes; migrate; assert snapshot equality.
- Credentials: seed with a real generated `CryptoKey`; assert plaintext matches after migration, and that the raw SQLite file contains no plaintext password.
- Kill mid-migration (throw after store N); relaunch; assert full completion and no duplicates.
- Re-run on an already-migrated db; assert no-op.
- Inject a count mismatch; assert the flag stays unset and the app stays on IDB.
- Empty IDB, and IDB with only some stores.
- Backup-write failure aborts the migration.

**T5. Failure injection.** Unreadable SQLite file, read-only dir, full disk, corrupt header. Expected: IDB fallback plus a visible diagnostic. Never an empty app.

**T6. Performance (gate G3).** Reuse `catalogPerformance.test.ts`. Import 200k channels and 50k movies. Targets: no more than 20% slower than IDB on import and cold read, and no UI freeze above 100 ms. If missed, change the batching before going further.

**T7. Manual run on a real build (Windows first).** Install v1.7.0 and create data (Xtream playlist with credentials, M3U, favorites, subtitle cache). Upgrade to the branch build and confirm everything survives. Upgrade again. Downgrade to 1.7.0 and confirm it still opens its untouched IDB.

## Phases and gates

| Phase | Work | Gate to continue |
|-------|------|------------------|
| 0 | Extract `Backend` interface, move IDB code to `idbBackend.ts`, build the T1 contract suite | All existing tests green, zero behavior change |
| 1 | `storage.rs`: schema, commands, T2 | `cargo test` green |
| 2 | `sqliteBackend.ts` plus backend switch on `isTauri()`; T1 and T3 against SQLite | Parity green, G3 performance met |
| 3 | Keychain encryption (D3) | Credential tests and raw-file plaintext check pass |
| 4 | Migration and fallback; T4 and T5 | All migration tests green |
| 5 | T7 on Windows, then Linux/macOS builds via CI | Signed off before merging |
| 6 | Release with IDB kept; one release later, delete old IDB | n/a |

CI: add `cargo test` to `ci.yml` if it is not already there.

## Risks

- **Keychain unavailable** (some Linux setups without a secret service): D3 fails. Mitigation: detect at startup and either fall back to a permission-restricted key file with a diagnostic, or block saving credentials with a clear message. Decide before Phase 3.
- **Parity drift** between the two backends (D4). Mitigated by the shared contract suite. If the web build is not shipped, drop D4 and the IDB backend after migration.
- **Downgrade** after migration: users who go back to an older version see old IDB data and lose changes made on SQLite. Acceptable; document in release notes.
- **Backup/restore** (`encryptBackup`, `restoreSnapshot`) must keep working across backends. Covered by T3.

## Open questions

1. Is the web build shipped to users, or only the desktop app?
2. Accept D3 (OS keychain)? Which platforms must be supported on day one?
3. Is deleting the old IDB after one release OK, or keep it indefinitely?
