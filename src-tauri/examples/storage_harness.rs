//! Test harness: serves the `storage_*` commands over stdin/stdout (one JSON object per line) so the
//! TypeScript suites can run against the real Rust store. Args use the same camelCase names the
//! webview sends to `invoke`. Usage: storage_harness [database-path] (in memory when omitted).
#![allow(dead_code)]

#[path = "../src/diagnostics.rs"]
mod diagnostics;
#[path = "../src/storage.rs"]
mod storage;

use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn text(args: &Value, name: &str) -> Result<String, String> {
    args[name]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("missing argument {name}"))
}

fn call(store: &storage::Store, command: &str, args: &Value) -> Result<Value, String> {
    Ok(match command {
        "storage_status" => Value::Null,
        "storage_get" => json!(store.get(&text(args, "storeName")?, &text(args, "key")?)?),
        "storage_get_all" => json!(store.get_all(&text(args, "storeName")?)?),
        "storage_get_all_by_index" => json!(store.get_all_by_index(
            &text(args, "storeName")?,
            &text(args, "index")?,
            &text(args, "value")?
        )?),
        "storage_tx" => {
            let ops = serde_json::from_value(args["ops"].clone()).map_err(|e| e.to_string())?;
            store.tx(ops)?;
            Value::Null
        }
        "storage_stage" => {
            let records =
                serde_json::from_value(args["records"].clone()).map_err(|e| e.to_string())?;
            store.stage(
                &text(args, "generation")?,
                &text(args, "storeName")?,
                records,
            )?;
            Value::Null
        }
        "storage_finish_catalog" => {
            let update = args.get("sourceUpdate").filter(|v| !v.is_null()).cloned();
            store.finish_catalog(
                &text(args, "playlistId")?,
                &text(args, "generation")?,
                update,
                args["includeEpisodes"].as_bool().unwrap_or(false),
            )?;
            Value::Null
        }
        "storage_delete_playlist" => json!(store.delete_playlist(&text(args, "id")?)?),
        "storage_meta_get" => json!(store.meta_get(&text(args, "key")?)?),
        "storage_meta_set" => {
            store.meta_set(&text(args, "key")?, &text(args, "value")?)?;
            Value::Null
        }
        "storage_wipe" => {
            store.wipe()?;
            Value::Null
        }
        "storage_encrypt" => json!(store.encrypt(&text(args, "text")?)?),
        "storage_decrypt" => json!(store.decrypt(&text(args, "sealed")?)?),
        other => return Err(format!("unknown command {other}")),
    })
}

fn main() {
    let key = [7u8; 32];
    let opened = match std::env::args().nth(1) {
        Some(path) => storage::Store::open(std::path::Path::new(&path), key),
        None => {
            storage::Store::from_connection(rusqlite::Connection::open_in_memory().unwrap(), key)
        }
    };
    let store = opened.expect("could not open the database");
    let mut out = std::io::stdout().lock();
    for line in std::io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let reply = match call(
            &store,
            request["command"].as_str().unwrap_or(""),
            &request["args"],
        ) {
            Ok(value) => json!({"id": request["id"], "ok": value}),
            Err(error) => json!({"id": request["id"], "error": error}),
        };
        writeln!(out, "{reply}").unwrap();
        out.flush().unwrap();
    }
}
