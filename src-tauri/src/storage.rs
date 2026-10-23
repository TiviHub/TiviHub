//! SQLite storage for the desktop app. Every command is one self-contained transaction;
//! records are kept as JSON next to the columns TiviHub queries by.

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;
use std::{path::Path, sync::Mutex};

use crate::diagnostics::BackendDiagnostics;

// Store name -> field holding the record key. Mirrors the IndexedDB object stores.
const STORES: &[(&str, &str)] = &[
    ("playlists", "id"),
    ("documents", "playlistId"),
    ("channels", "id"),
    ("movies", "id"),
    ("series", "id"),
    ("episodes", "id"),
    ("favorites", "id"),
    ("library", "id"),
    ("epg", "id"),
    ("ratings", "key"),
    ("popularCatalog", "key"),
    ("mdblistRateLimits", "key"),
    ("subtitleSearch", "key"),
    ("subtitleFiles", "fileId"),
    ("subtitleChoices", "itemId"),
    ("secrets", "id"),
];
const CATALOG_STORES: &[&str] = &["channels", "movies", "series"];
const PLAYLIST_SCOPED_STORES: &[&str] = &[
    "channels",
    "movies",
    "series",
    "episodes",
    "favorites",
    "library",
];
const KEY_SERVICE: &str = "TiviHub";
const KEY_NAME: &str = "local-encryption-key";
const KEY_FILE: &str = "storage.key";
const DECRYPT_ERROR: &str =
    "Local encrypted data could not be opened in this TiviHub installation.";

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Op {
    Put {
        store: String,
        record: Value,
    },
    Delete {
        store: String,
        key: String,
    },
    Clear {
        store: String,
    },
    DeleteByIndex {
        store: String,
        index: String,
        value: String,
    },
}

pub struct Store {
    conn: Mutex<Connection>,
    key: [u8; 32],
}

pub struct StorageState(pub Result<Store, String>);

fn store_key_field(store: &str) -> Result<&'static str, String> {
    STORES
        .iter()
        .find(|(name, _)| *name == store)
        .map(|(_, field)| *field)
        .ok_or_else(|| format!("Unknown store: {store}"))
}

fn index_column(index: &str) -> Result<&'static str, String> {
    match index {
        "byPlaylist" => Ok("playlist_id"),
        "bySeries" => Ok("series_id"),
        "byChannel" => Ok("channel_id"),
        "bySource" => Ok("source"),
        _ => Err(format!("Unknown index: {index}")),
    }
}

fn text_field(record: &Value, field: &str) -> Option<String> {
    record.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn record_key(store: &str, record: &Value) -> Result<String, String> {
    match record.get(store_key_field(store)?) {
        Some(Value::String(key)) => Ok(key.clone()),
        Some(Value::Number(key)) => Ok(key.to_string()),
        _ => Err(format!("A {store} record has no usable key.")),
    }
}

fn put_row(conn: &Connection, store: &str, record: &Value) -> Result<(), String> {
    conn.execute(
        &format!(
            "INSERT OR REPLACE INTO \"{store}\" (key, playlist_id, series_id, channel_id, source, json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ),
        params![
            record_key(store, record)?,
            text_field(record, "playlistId"),
            text_field(record, "seriesId"),
            text_field(record, "channelId"),
            text_field(record, "source"),
            record.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version < 1 {
        for (store, _) in STORES {
            conn.execute_batch(&format!(
                "CREATE TABLE IF NOT EXISTS \"{store}\" (key TEXT PRIMARY KEY, playlist_id TEXT, \
                 series_id TEXT, channel_id TEXT, source TEXT, json TEXT NOT NULL);"
            ))
            .map_err(|e| e.to_string())?;
        }
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS channels_playlist ON channels(playlist_id);
             CREATE INDEX IF NOT EXISTS movies_playlist ON movies(playlist_id);
             CREATE INDEX IF NOT EXISTS series_playlist ON series(playlist_id);
             CREATE INDEX IF NOT EXISTS episodes_playlist ON episodes(playlist_id);
             CREATE INDEX IF NOT EXISTS episodes_series ON episodes(series_id);
             CREATE INDEX IF NOT EXISTS favorites_playlist ON favorites(playlist_id);
             CREATE INDEX IF NOT EXISTS library_playlist ON library(playlist_id);
             CREATE INDEX IF NOT EXISTS epg_source ON epg(source);
             CREATE INDEX IF NOT EXISTS epg_channel ON epg(channel_id);
             CREATE TABLE IF NOT EXISTS catalog_staging (generation TEXT NOT NULL, store TEXT NOT NULL, \
               key TEXT NOT NULL, playlist_id TEXT, series_id TEXT, json TEXT NOT NULL, \
               PRIMARY KEY (generation, store, key));
             CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             PRAGMA user_version = 1;",
        )
        .map_err(|e| e.to_string())?;
    }
    if version < 2 {
        // Adds stores introduced after version 1 (subtitleChoices) to existing databases.
        for (store, _) in STORES {
            conn.execute_batch(&format!(
                "CREATE TABLE IF NOT EXISTS \"{store}\" (key TEXT PRIMARY KEY, playlist_id TEXT,                  series_id TEXT, channel_id TEXT, source TEXT, json TEXT NOT NULL);"
            ))
            .map_err(|e| e.to_string())?;
        }
        conn.execute_batch("PRAGMA user_version = 2;")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

impl Store {
    pub fn from_connection(conn: Connection, key: [u8; 32]) -> Result<Self, String> {
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| e.to_string())?;
        let check: String = conn
            .pragma_query_value(None, "quick_check", |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if check != "ok" {
            return Err("The local TiviHub database is damaged.".to_string());
        }
        migrate(&conn)?;
        // A crash between staged batches and storage_finish_catalog leaves unreferenced rows.
        conn.execute("DELETE FROM catalog_staging", [])
            .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
            key,
        })
    }

    pub fn open(path: &Path, key: [u8; 32]) -> Result<Self, String> {
        Self::from_connection(Connection::open(path).map_err(|e| e.to_string())?, key)
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub fn get(&self, store: &str, key: &str) -> Result<Option<String>, String> {
        store_key_field(store)?;
        self.conn()
            .query_row(
                &format!("SELECT json FROM \"{store}\" WHERE key = ?1"),
                [key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    fn collect(&self, sql: &str, args: &[&dyn rusqlite::ToSql]) -> Result<String, String> {
        let conn = self.conn();
        let mut statement = conn.prepare_cached(sql).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(args, |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut out = String::from("[");
        for (index, row) in rows.enumerate() {
            if index > 0 {
                out.push(',');
            }
            out.push_str(&row.map_err(|e| e.to_string())?);
        }
        out.push(']');
        Ok(out)
    }

    pub fn get_all(&self, store: &str) -> Result<String, String> {
        store_key_field(store)?;
        self.collect(&format!("SELECT json FROM \"{store}\" ORDER BY key"), &[])
    }

    pub fn get_all_by_index(
        &self,
        store: &str,
        index: &str,
        value: &str,
    ) -> Result<String, String> {
        store_key_field(store)?;
        let column = index_column(index)?;
        self.collect(
            &format!("SELECT json FROM \"{store}\" WHERE {column} = ?1 ORDER BY key"),
            &[&value],
        )
    }

    pub fn tx(&self, ops: Vec<Op>) -> Result<(), String> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for op in &ops {
            match op {
                Op::Put { store, record } => {
                    store_key_field(store)?;
                    put_row(&tx, store, record)?;
                }
                Op::Delete { store, key } => {
                    store_key_field(store)?;
                    tx.execute(&format!("DELETE FROM \"{store}\" WHERE key = ?1"), [key])
                        .map_err(|e| e.to_string())?;
                }
                Op::Clear { store } => {
                    store_key_field(store)?;
                    tx.execute(&format!("DELETE FROM \"{store}\""), [])
                        .map_err(|e| e.to_string())?;
                }
                Op::DeleteByIndex {
                    store,
                    index,
                    value,
                } => {
                    store_key_field(store)?;
                    let column = index_column(index)?;
                    tx.execute(
                        &format!("DELETE FROM \"{store}\" WHERE {column} = ?1"),
                        [value],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Stage catalog rows outside the live tables so a crash cannot leave a half-old, half-new catalog.
    pub fn stage(&self, generation: &str, store: &str, records: Vec<Value>) -> Result<(), String> {
        if store_key_field(store)? != "id"
            || !(CATALOG_STORES.contains(&store) || store == "episodes")
        {
            return Err(format!("{store} cannot be staged."));
        }
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for record in &records {
            tx.execute(
                "INSERT OR REPLACE INTO catalog_staging (generation, store, key, playlist_id, series_id, json) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    generation,
                    store,
                    record_key(store, record)?,
                    text_field(record, "playlistId"),
                    text_field(record, "seriesId"),
                    record.to_string(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn finish_catalog(
        &self,
        playlist_id: &str,
        generation: &str,
        source_update: Option<Value>,
        include_episodes: bool,
    ) -> Result<(), String> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        if source_update.is_some() {
            let exists = tx
                .query_row(
                    "SELECT 1 FROM playlists WHERE key = ?1",
                    [playlist_id],
                    |_| Ok(()),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if exists.is_none() {
                return Err(
                    "This source was deleted before its refreshed catalog could be saved."
                        .to_string(),
                );
            }
        }
        let mut stores = CATALOG_STORES.to_vec();
        if include_episodes {
            stores.push("episodes");
        }
        for store in stores {
            tx.execute(
                &format!("DELETE FROM \"{store}\" WHERE playlist_id = ?1"),
                [playlist_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                &format!(
                    "INSERT OR REPLACE INTO \"{store}\" (key, playlist_id, series_id, json) \
                     SELECT key, playlist_id, series_id, json FROM catalog_staging \
                     WHERE generation = ?1 AND store = ?2"
                ),
                params![generation, store],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(source) = &source_update {
            put_row(&tx, "playlists", source)?;
        }
        tx.execute(
            "DELETE FROM catalog_staging WHERE generation = ?1",
            [generation],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    /// Returns how many records were removed.
    pub fn delete_playlist(&self, id: &str) -> Result<u64, String> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut removed = 0;
        for store in PLAYLIST_SCOPED_STORES {
            removed += tx
                .execute(
                    &format!("DELETE FROM \"{store}\" WHERE playlist_id = ?1"),
                    [id],
                )
                .map_err(|e| e.to_string())?;
        }
        removed += tx
            .execute("DELETE FROM epg WHERE source = ?1", [id])
            .map_err(|e| e.to_string())?;
        for store in ["documents", "playlists"] {
            removed += tx
                .execute(&format!("DELETE FROM \"{store}\" WHERE key = ?1"), [id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(removed as u64)
    }

    pub fn meta_get(&self, key: &str) -> Result<Option<String>, String> {
        self.conn()
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn meta_set(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn()
            .execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
                [key, value],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Empties every data table; used to discard a migration copy that failed verification.
    pub fn wipe(&self) -> Result<(), String> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (store, _) in STORES {
            tx.execute(&format!("DELETE FROM \"{store}\""), [])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn encrypt(&self, text: &str) -> Result<String, String> {
        let cipher = Aes256Gcm::new(&self.key.into());
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let mut sealed = nonce.to_vec();
        sealed.extend(
            cipher
                .encrypt(&nonce, text.as_bytes())
                .map_err(|_| "Could not encrypt local data.".to_string())?,
        );
        Ok(B64.encode(sealed))
    }

    pub fn decrypt(&self, sealed: &str) -> Result<String, String> {
        let bytes = B64.decode(sealed).map_err(|_| DECRYPT_ERROR.to_string())?;
        if bytes.len() < 12 {
            return Err(DECRYPT_ERROR.to_string());
        }
        let (nonce, ciphertext) = bytes.split_at(12);
        let plain = Aes256Gcm::new(&self.key.into())
            .decrypt(Nonce::from_slice(nonce), ciphertext)
            .map_err(|_| DECRYPT_ERROR.to_string())?;
        String::from_utf8(plain).map_err(|_| DECRYPT_ERROR.to_string())
    }
}

fn random_key() -> [u8; 32] {
    Aes256Gcm::generate_key(OsRng).into()
}

fn decode_key(encoded: &str) -> Result<[u8; 32], String> {
    B64.decode(encoded.trim())
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
        .ok_or_else(|| "The stored TiviHub encryption key is invalid.".to_string())
}

pub const DATABASE_FILE: &str = "tivihub.sqlite3";

#[derive(Debug, PartialEq)]
enum KeychainAction {
    Use(String),
    Create,
    UseFile,
    Fail,
}

/// A keychain error must never mint a new key while encrypted data exists: the old key would be
/// shadowed by the new file and every saved login would become unreadable.
fn keychain_action(read: Result<String, keyring::Error>, has_data: bool) -> KeychainAction {
    match read {
        Ok(stored) => KeychainAction::Use(stored),
        Err(keyring::Error::NoEntry) => KeychainAction::Create,
        Err(_) if has_data => KeychainAction::Fail,
        Err(_) => KeychainAction::UseFile,
    }
}

/// The OS keychain holds the key. Where there is none (for example Linux without a secret
/// service) a key file next to the database is used instead, and a diagnostic is recorded.
pub fn load_or_create_key(
    dir: &Path,
    diagnostics: &BackendDiagnostics,
) -> Result<[u8; 32], String> {
    let file = dir.join(KEY_FILE);
    if let Ok(existing) = std::fs::read_to_string(&file) {
        return decode_key(&existing);
    }
    if let Ok(entry) = keyring::Entry::new(KEY_SERVICE, KEY_NAME) {
        let has_data = dir.join(DATABASE_FILE).exists();
        match keychain_action(entry.get_password(), has_data) {
            KeychainAction::Use(stored) => return decode_key(&stored),
            KeychainAction::Create => {
                let key = random_key();
                if entry.set_password(&B64.encode(key)).is_ok() {
                    return Ok(key);
                }
            }
            KeychainAction::UseFile => {}
            KeychainAction::Fail => {
                return Err(
                    "The system keychain could not be read. Restart TiviHub to try again."
                        .to_string(),
                );
            }
        }
    }
    diagnostics.record("storage", "KEY_FILE_FALLBACK");
    let key = random_key();
    std::fs::write(&file, B64.encode(key))
        .map_err(|_| "Could not save the TiviHub encryption key.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600));
    }
    Ok(key)
}

fn store<'a>(state: &'a tauri::State<'_, StorageState>) -> Result<&'a Store, String> {
    state.0.as_ref().map_err(Clone::clone)
}

#[tauri::command]
pub async fn storage_status(state: tauri::State<'_, StorageState>) -> Result<(), String> {
    store(&state).map(|_| ())
}

#[tauri::command]
pub async fn storage_get(
    state: tauri::State<'_, StorageState>,
    store_name: String,
    key: String,
) -> Result<Option<String>, String> {
    store(&state)?.get(&store_name, &key)
}

#[tauri::command]
pub async fn storage_get_all(
    state: tauri::State<'_, StorageState>,
    store_name: String,
) -> Result<String, String> {
    store(&state)?.get_all(&store_name)
}

#[tauri::command]
pub async fn storage_get_all_by_index(
    state: tauri::State<'_, StorageState>,
    store_name: String,
    index: String,
    value: String,
) -> Result<String, String> {
    store(&state)?.get_all_by_index(&store_name, &index, &value)
}

#[tauri::command]
pub async fn storage_tx(state: tauri::State<'_, StorageState>, ops: Vec<Op>) -> Result<(), String> {
    store(&state)?.tx(ops)
}

#[tauri::command]
pub async fn storage_stage(
    state: tauri::State<'_, StorageState>,
    generation: String,
    store_name: String,
    records: Vec<Value>,
) -> Result<(), String> {
    store(&state)?.stage(&generation, &store_name, records)
}

#[tauri::command]
pub async fn storage_finish_catalog(
    state: tauri::State<'_, StorageState>,
    playlist_id: String,
    generation: String,
    source_update: Option<Value>,
    include_episodes: bool,
) -> Result<(), String> {
    store(&state)?.finish_catalog(&playlist_id, &generation, source_update, include_episodes)
}

#[tauri::command]
pub async fn storage_delete_playlist(
    state: tauri::State<'_, StorageState>,
    id: String,
) -> Result<u64, String> {
    store(&state)?.delete_playlist(&id)
}

#[tauri::command]
pub async fn storage_meta_get(
    state: tauri::State<'_, StorageState>,
    key: String,
) -> Result<Option<String>, String> {
    store(&state)?.meta_get(&key)
}

#[tauri::command]
pub async fn storage_meta_set(
    state: tauri::State<'_, StorageState>,
    key: String,
    value: String,
) -> Result<(), String> {
    store(&state)?.meta_set(&key, &value)
}

#[tauri::command]
pub async fn storage_wipe(state: tauri::State<'_, StorageState>) -> Result<(), String> {
    store(&state)?.wipe()
}

#[tauri::command]
pub async fn storage_encrypt(
    state: tauri::State<'_, StorageState>,
    text: String,
) -> Result<String, String> {
    store(&state)?.encrypt(&text)
}

#[tauri::command]
pub async fn storage_decrypt(
    state: tauri::State<'_, StorageState>,
    sealed: String,
) -> Result<String, String> {
    store(&state)?.decrypt(&sealed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn store() -> Store {
        Store::from_connection(Connection::open_in_memory().unwrap(), [7; 32]).unwrap()
    }

    fn put(store: &Store, name: &str, record: Value) {
        store
            .tx(vec![Op::Put {
                store: name.into(),
                record,
            }])
            .unwrap();
    }

    fn rows(json: String) -> Vec<Value> {
        serde_json::from_str(&json).unwrap()
    }

    #[test]
    fn round_trips_and_upserts_records() {
        let s = store();
        put(
            &s,
            "favorites",
            json!({"id": "a", "playlistId": "p", "title": "one"}),
        );
        put(
            &s,
            "favorites",
            json!({"id": "a", "playlistId": "p", "title": "two"}),
        );
        let all = rows(s.get_all("favorites").unwrap());
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["title"], "two");
        assert!(s.get("favorites", "missing").unwrap().is_none());
    }

    fn temp_db(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("tivihub-{name}-{}.db", std::process::id()));
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
        path
    }

    // Gate G3: run with `cargo test --release -- --ignored --nocapture catalog_import_speed`.
    #[test]
    #[ignore]
    fn catalog_import_speed() {
        let path = temp_db("perf");
        let s = Store::open(&path, [7; 32]).unwrap();
        put(&s, "playlists", json!({"id": "p"}));
        let started = std::time::Instant::now();
        for start in (0..200_000).step_by(1000) {
            let batch = (start..start + 1000)
                .map(|i| json!({"id": format!("c{i}"), "playlistId": "p", "name": format!("Channel {i}"), "group": "News"}))
                .collect();
            s.stage("g", "channels", batch).unwrap();
        }
        let staged = started.elapsed();
        s.finish_catalog("p", "g", Some(json!({"id": "p"})), false)
            .unwrap();
        let total = started.elapsed();
        let read = std::time::Instant::now();
        let all = rows(s.get_all_by_index("channels", "byPlaylist", "p").unwrap());
        println!(
            "200k channels: stage {staged:?}, total import {total:?}, cold read {:?}",
            read.elapsed()
        );
        assert_eq!(all.len(), 200_000);
    }

    #[test]
    fn data_survives_reopening_the_file() {
        let path = temp_db("reopen");
        let s = Store::open(&path, [7; 32]).unwrap();
        put(&s, "favorites", json!({"id": "a", "playlistId": "p"}));
        drop(s);
        let s = Store::open(&path, [7; 32]).unwrap();
        assert_eq!(rows(s.get_all("favorites").unwrap()).len(), 1);
    }

    #[test]
    fn refuses_a_corrupt_database_file() {
        let path = temp_db("corrupt");
        std::fs::write(&path, vec![0xAB; 4096]).unwrap();
        assert!(Store::open(&path, [7; 32]).is_err());
    }

    #[test]
    fn refuses_a_read_only_database_instead_of_losing_writes() {
        let path = temp_db("readonly");
        drop(Store::open(&path, [7; 32]).unwrap());
        let original = std::fs::metadata(&path).unwrap().permissions();
        let mut read_only = original.clone();
        read_only.set_readonly(true);
        std::fs::set_permissions(&path, read_only).unwrap();
        let opened = Store::open(&path, [7; 32]);
        let writable = opened.as_ref().map(|s| {
            s.tx(vec![Op::Put {
                store: "favorites".into(),
                record: json!({"id": "a"}),
            }])
            .is_ok()
        });
        std::fs::set_permissions(&path, original).unwrap();
        // Either opening fails (then the app falls back or shows an error) or writes fail loudly; never silently succeed.
        assert!(
            opened.is_err() || writable == Ok(false),
            "read-only database accepted a write"
        );
    }

    #[test]
    fn sealed_credentials_are_not_readable_in_the_database_files() {
        let path = temp_db("plaintext");
        let s = Store::open(&path, [7; 32]).unwrap();
        let sealed = s.encrypt("hunter2-secret-password").unwrap();
        put(&s, "playlists", json!({"id": "p", "privateData": sealed}));
        drop(s);
        for suffix in ["", "-wal"] {
            let bytes = std::fs::read(format!("{}{suffix}", path.display())).unwrap_or_default();
            assert!(
                !bytes.windows(7).any(|w| w == b"hunter2"),
                "plaintext found in {suffix:?} file"
            );
        }
    }

    #[test]
    fn a_full_disk_fails_the_write_and_keeps_existing_data() {
        let path = temp_db("full");
        let s = Store::open(&path, [7; 32]).unwrap();
        put(&s, "favorites", json!({"id": "kept", "playlistId": "p"}));
        let pages: i64 = s
            .conn()
            .query_row("PRAGMA page_count", [], |r| r.get(0))
            .unwrap();
        // SQLite reports the same "database or disk is full" error once the page limit is reached.
        s.conn()
            .pragma_update(None, "max_page_count", pages)
            .unwrap();
        let big = "x".repeat(100_000);
        let result = s.tx(vec![Op::Put {
            store: "favorites".into(),
            record: json!({"id": "big", "playlistId": "p", "blob": big}),
        }]);
        assert!(result.unwrap_err().contains("full"));
        let all = rows(s.get_all("favorites").unwrap());
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["id"], "kept");
    }

    #[test]
    fn an_existing_key_file_is_reused_and_a_damaged_one_is_rejected() {
        let dir = std::env::temp_dir().join(format!("tivihub-keydir-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let diagnostics = BackendDiagnostics::default();
        std::fs::write(dir.join(KEY_FILE), B64.encode([9u8; 32])).unwrap();
        assert_eq!(load_or_create_key(&dir, &diagnostics).unwrap(), [9u8; 32]);
        std::fs::write(dir.join(KEY_FILE), "not a key").unwrap();
        assert!(load_or_create_key(&dir, &diagnostics).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_keychain_error_never_replaces_the_key_of_existing_data() {
        let failure = || keyring::Error::NoStorageAccess("locked".into());
        assert_eq!(keychain_action(Err(failure()), true), KeychainAction::Fail);
        assert_eq!(
            keychain_action(Err(failure()), false),
            KeychainAction::UseFile
        );
        assert_eq!(
            keychain_action(Err(keyring::Error::NoEntry), false),
            KeychainAction::Create
        );
        assert_eq!(
            keychain_action(Ok("k".into()), true),
            KeychainAction::Use("k".into())
        );
    }

    #[test]
    fn numeric_keys_are_stored_as_text() {
        let s = store();
        put(&s, "subtitleFiles", json!({"fileId": 42, "data": "x"}));
        assert!(s.get("subtitleFiles", "42").unwrap().is_some());
    }

    #[test]
    fn queries_by_index() {
        let s = store();
        put(
            &s,
            "episodes",
            json!({"id": "e1", "playlistId": "p", "seriesId": "s1"}),
        );
        put(
            &s,
            "episodes",
            json!({"id": "e2", "playlistId": "p", "seriesId": "s2"}),
        );
        assert_eq!(
            rows(s.get_all_by_index("episodes", "bySeries", "s1").unwrap()).len(),
            1
        );
        assert_eq!(
            rows(s.get_all_by_index("episodes", "byPlaylist", "p").unwrap()).len(),
            2
        );
    }

    #[test]
    fn rejects_unknown_stores_and_rolls_back_failed_batches() {
        let s = store();
        assert!(s.get_all("sqlite_master; DROP TABLE playlists").is_err());
        let result = s.tx(vec![
            Op::Put {
                store: "favorites".into(),
                record: json!({"id": "a"}),
            },
            Op::Put {
                store: "favorites".into(),
                record: json!({"noKey": true}),
            },
        ]);
        assert!(result.is_err());
        assert_eq!(rows(s.get_all("favorites").unwrap()).len(), 0);
    }

    #[test]
    fn finish_catalog_swaps_rows_and_keeps_episodes_unless_asked() {
        let s = store();
        put(&s, "playlists", json!({"id": "p"}));
        put(&s, "channels", json!({"id": "old", "playlistId": "p"}));
        put(&s, "channels", json!({"id": "other", "playlistId": "q"}));
        put(
            &s,
            "episodes",
            json!({"id": "e", "playlistId": "p", "seriesId": "s"}),
        );
        s.stage(
            "g1",
            "channels",
            vec![json!({"id": "new", "playlistId": "p"})],
        )
        .unwrap();
        s.finish_catalog(
            "p",
            "g1",
            Some(json!({"id": "p", "name": "updated"})),
            false,
        )
        .unwrap();
        let ids: Vec<_> = rows(s.get_all("channels").unwrap())
            .iter()
            .map(|r| r["id"].clone())
            .collect();
        assert_eq!(ids, vec![json!("new"), json!("other")]);
        assert_eq!(rows(s.get_all("episodes").unwrap()).len(), 1);
        assert!(s
            .get("playlists", "p")
            .unwrap()
            .unwrap()
            .contains("updated"));
    }

    #[test]
    fn unfinished_catalog_leaves_live_rows_untouched_and_staging_is_cleaned() {
        let path = std::env::temp_dir().join(format!("tivihub-test-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let s = Store::open(&path, [7; 32]).unwrap();
        put(&s, "channels", json!({"id": "old", "playlistId": "p"}));
        s.stage(
            "g1",
            "channels",
            vec![json!({"id": "old", "playlistId": "p", "title": "half"})],
        )
        .unwrap();
        drop(s);
        let reopened = Store::open(&path, [7; 32]).unwrap();
        let all = rows(reopened.get_all("channels").unwrap());
        assert_eq!(all.len(), 1);
        assert!(all[0].get("title").is_none());
        let staged: i64 = reopened
            .conn()
            .query_row("SELECT COUNT(*) FROM catalog_staging", [], |r| r.get(0))
            .unwrap();
        assert_eq!(staged, 0);
        drop(reopened);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn finish_catalog_fails_when_the_playlist_was_deleted() {
        let s = store();
        s.stage(
            "g1",
            "channels",
            vec![json!({"id": "c", "playlistId": "gone"})],
        )
        .unwrap();
        let error = s
            .finish_catalog("gone", "g1", Some(json!({"id": "gone"})), false)
            .unwrap_err();
        assert!(error.contains("deleted"));
        assert_eq!(rows(s.get_all("channels").unwrap()).len(), 0);
    }

    #[test]
    fn delete_playlist_removes_everything_it_owns() {
        let s = store();
        put(&s, "playlists", json!({"id": "p"}));
        put(&s, "documents", json!({"playlistId": "p"}));
        put(&s, "channels", json!({"id": "c", "playlistId": "p"}));
        put(
            &s,
            "epg",
            json!({"id": "x", "source": "p", "channelId": "c"}),
        );
        put(&s, "channels", json!({"id": "keep", "playlistId": "q"}));
        assert_eq!(s.delete_playlist("p").unwrap(), 4);
        assert_eq!(rows(s.get_all("channels").unwrap()).len(), 1);
        assert_eq!(rows(s.get_all("epg").unwrap()).len(), 0);
        assert_eq!(s.delete_playlist("p").unwrap(), 0);
    }

    #[test]
    fn encryption_round_trips_and_rejects_tampering_and_wrong_keys() {
        let s = store();
        let sealed = s.encrypt("secret").unwrap();
        assert!(!sealed.contains("secret"));
        assert_eq!(s.decrypt(&sealed).unwrap(), "secret");
        assert_ne!(sealed, s.encrypt("secret").unwrap());
        let other = Store::from_connection(Connection::open_in_memory().unwrap(), [8; 32]).unwrap();
        assert!(other.decrypt(&sealed).is_err());
        assert!(s.decrypt("not base64!").is_err());
    }

    #[test]
    fn wipe_empties_data_but_keeps_meta() {
        let s = store();
        put(&s, "favorites", json!({"id": "a"}));
        s.meta_set("k", "v").unwrap();
        s.wipe().unwrap();
        assert_eq!(rows(s.get_all("favorites").unwrap()).len(), 0);
        assert_eq!(s.meta_get("k").unwrap().as_deref(), Some("v"));
    }

    #[test]
    fn accepts_the_op_shapes_the_frontend_sends() {
        let ops: Vec<Op> = serde_json::from_str(
            r#"[{"op":"put","store":"favorites","record":{"id":"a"}},
                {"op":"deleteByIndex","store":"epg","index":"bySource","value":"p"},
                {"op":"clear","store":"ratings"},
                {"op":"delete","store":"favorites","key":"a"}]"#,
        )
        .unwrap();
        let s = store();
        s.tx(ops).unwrap();
        assert_eq!(rows(s.get_all("favorites").unwrap()).len(), 0);
    }
}
