---
name: database
description: TiviHub's local storage (SQLite in Rust, IndexedDB in browser mode). Use when adding or changing a stored record, store, index, migration, cache or backup.
---

# Database rules

Two backends behind one interface (`StorageBackend` in `src/storage/backend.ts`):

- **SQLite** (desktop): `src-tauri/src/storage.rs`, commands `storage_*`, called by `src/storage/sqliteBackend.ts`.
- **IndexedDB** (browser mode and legacy data): `src/storage/idbBackend.ts`, copied over once by `src/storage/migration.ts` (`migrateToSqlite`).

`src/storage/database.ts` is the only facade the rest of the app uses.

## Shape

Each store is one table: `key TEXT PRIMARY KEY, playlist_id, series_id, channel_id, source, json TEXT NOT NULL`. The record is the `json` column; the other columns exist only for indexes. The store list and key field live in `STORES` in `storage.rs` and must match the IndexedDB stores and `StoreValues` in `backend.ts`. Schema version is `PRAGMA user_version` (currently 4) in `migrate()`.

## Adding a stored thing

1. Add the type to `src/types.ts` and a line to `StoreValues` (`backend.ts`).
2. Add the store to `STORES` in `storage.rs` (name, key field) and to the IndexedDB schema.
3. **Add a migration step** `if version < N { ... PRAGMA user_version = N; }` in `migrate()`. Never edit an earlier step: existing users already ran it. Steps are idempotent (`IF NOT EXISTS`).
4. Add a typed getter/setter in `database.ts`. Components never touch the backend.
5. Add the store to the backup/export path (`src/services/backup.ts`) if it is user data, or leave it out on purpose if it is a cache.
6. Tests: extend `storageContract.ts` (runs against both backends), and add a migration test next to `sqliteMigration*.test.ts` that opens an old-version database and checks the data survives.

## Rules

- **Large writes are batched** via `storage_tx` (a list of `Op`s, one transaction). A catalog import writes to `catalog_staging` (`storage_stage`) and swaps with `storage_finish_catalog`; the visible catalog is never half-written. Do not loop single `put`s for thousands of rows.
- **Xtream movies and series are not bulk-imported.** The `movies` and `series` stores hold what was read while browsing (written per category answer); never assume they hold the whole catalog, and never replace them from an Xtream refresh.
- **Playlist-scoped data** (`PLAYLIST_SCOPED_STORES`) is removed with `storage_delete_playlist`. A new per-playlist store goes in that list and gets a `playlist_id` index.
- **Index what you query.** A new "get all by X" needs an index on X in the migration. Never filter a whole catalog in JS when SQLite can do it.
- **Secrets** are encrypted (`storage_encrypt` / `storage_decrypt`, key in the OS keychain) and stored in `secrets`. A keychain failure shows an error and stops; it must never create a new key (that locks users out of saved logins).
- **Caches** (`ratings`, `liveCategoryCache`, `subtitleSearch`, ...) have a TTL constant next to their service and tolerate being wiped. Never put the only copy of user data in a cache store. `liveCategoryCache` also holds the Xtream category lists and per-category answers of Movies and Series (keys `<playlistId>:series:...`); `popularCatalog` is an unused leftover of the removed Top 5 row (only a getter/setter in `database.ts` and one test still touch it): do not write to it, and drop it, with that code, only in a new migration step.
- **Reminders** are kept after they fire: the record stays in `reminders` with `firedAt`, `missed` and `seen` (extra JSON fields, so no migration) and is the bell's history, pruned to 20 in `useReminders`. Anything that reads `reminders` must skip records with `firedAt` unless it wants history (`splitReminders` does).
- **Never** destroy data to fix a schema problem. Migrate it, or ask.
- No new storage mechanism (second DB, files, `localStorage` for data).

## Speed

Catalogs reach 200k+ rows. `src/__tests__/storagePerformance.rust.test.ts` and `npm run perf:all` guard this. A change to the storage layer re-runs both.
