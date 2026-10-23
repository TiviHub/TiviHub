#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chromecast;
mod diagnostics;
mod net;
mod storage;

use diagnostics::{BackendDiagnosticEvent, BackendDiagnostics};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

#[derive(Serialize)]
struct DownloadDirectoryInfo {
    path: String,
    name: String,
}

fn saved_directory_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "Could not find TiviHub's settings folder.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|_| "Could not create TiviHub's settings folder.".to_string())?;
    Ok(dir.join("download-directory.txt"))
}

// Write access is only ever granted to a folder the user picked in the native dialog
// (or one saved from such a pick), never to a path supplied by the webview.
fn allow_download_directory(app: &AppHandle, path: &Path) -> Result<DownloadDirectoryInfo, String> {
    let directory = path
        .canonicalize()
        .map_err(|_| "Could not access the selected download folder.".to_string())?;
    if !directory.is_dir() {
        return Err("The selected download location is not a folder.".to_string());
    }

    app.fs_scope()
        .allow_directory(&directory, true)
        .map_err(|_| {
            "TiviHub could not get permission to write to the selected folder.".to_string()
        })?;
    Ok(DownloadDirectoryInfo {
        path: directory.to_string_lossy().into_owned(),
        name: directory
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Downloads")
            .to_string(),
    })
}

#[tauri::command]
async fn choose_download_directory(
    app: AppHandle,
) -> Result<Option<DownloadDirectoryInfo>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| "Could not read the selected download folder.".to_string())?;
    let info = allow_download_directory(&app, &path)?;
    std::fs::write(saved_directory_file(&app)?, &info.path)
        .map_err(|_| "Could not remember the selected download folder.".to_string())?;
    Ok(Some(info))
}

#[tauri::command]
fn saved_download_directory(app: AppHandle) -> Result<Option<DownloadDirectoryInfo>, String> {
    let Ok(saved) = std::fs::read_to_string(saved_directory_file(&app)?) else {
        return Ok(None);
    };
    allow_download_directory(&app, Path::new(saved.trim())).map(Some)
}

#[tauri::command]
async fn discover_cast_devices(
    diagnostics: State<'_, BackendDiagnostics>,
) -> Result<Vec<chromecast::CastDeviceInfo>, String> {
    match tauri::async_runtime::spawn_blocking(chromecast::discover_devices).await {
        Ok(Ok(devices)) => Ok(devices),
        Ok(Err(_)) => {
            diagnostics.record("chromecast", "CAST_DISCOVERY_FAILED");
            Err("Couldn't search for casting devices. Check that they're on the same network and try again.".to_string())
        }
        Err(_) => {
            diagnostics.record("chromecast", "CAST_DISCOVERY_TASK_FAILED");
            Err("Couldn't complete the casting device search. Please try again.".to_string())
        }
    }
}

#[tauri::command]
async fn cast_media(
    diagnostics: State<'_, BackendDiagnostics>,
    address: String,
    stream_url: String,
    title: String,
    live: bool,
) -> Result<(), String> {
    match tauri::async_runtime::spawn_blocking(move || {
        chromecast::cast_media(&address, &stream_url, &title, live)
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) => {
            diagnostics.record("chromecast", "CAST_START_FAILED");
            Err("Couldn't start casting. Check that the device and stream are available, then try again.".to_string())
        }
        Err(_) => {
            diagnostics.record("chromecast", "CAST_START_TASK_FAILED");
            Err("Couldn't complete the casting request. Please try again.".to_string())
        }
    }
}

#[tauri::command]
async fn stop_cast(
    diagnostics: State<'_, BackendDiagnostics>,
    address: String,
) -> Result<(), String> {
    match tauri::async_runtime::spawn_blocking(move || chromecast::stop_cast(&address)).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) => {
            diagnostics.record("chromecast", "CAST_STOP_FAILED");
            Err("Couldn't stop casting on that device. Please try again.".to_string())
        }
        Err(_) => {
            diagnostics.record("chromecast", "CAST_STOP_TASK_FAILED");
            Err("Couldn't complete the stop-casting request. Please try again.".to_string())
        }
    }
}

#[tauri::command]
fn get_backend_diagnostics(
    diagnostics: State<'_, BackendDiagnostics>,
) -> Vec<BackendDiagnosticEvent> {
    diagnostics.snapshot()
}

fn main() {
    tauri::Builder::default()
        .manage(BackendDiagnostics::default())
        .manage(net::ProxyState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let diagnostics = app.state::<BackendDiagnostics>();
            let opened = app
                .path()
                .app_data_dir()
                .map_err(|_| "Could not find TiviHub's data folder.".to_string())
                .and_then(|dir| {
                    std::fs::create_dir_all(&dir)
                        .map_err(|_| "Could not create TiviHub's data folder.".to_string())?;
                    let key = storage::load_or_create_key(&dir, &diagnostics)?;
                    storage::Store::open(&dir.join(storage::DATABASE_FILE), key)
                });
            if opened.is_err() {
                diagnostics.record("storage", "SQLITE_OPEN_FAILED");
            }
            app.manage(storage::StorageState(opened));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            choose_download_directory,
            saved_download_directory,
            discover_cast_devices,
            cast_media,
            stop_cast,
            get_backend_diagnostics,
            net::http_fetch,
            net::proxy_register,
            storage::storage_status,
            storage::storage_get,
            storage::storage_get_all,
            storage::storage_get_all_by_index,
            storage::storage_tx,
            storage::storage_stage,
            storage::storage_finish_catalog,
            storage::storage_delete_playlist,
            storage::storage_meta_get,
            storage::storage_meta_set,
            storage::storage_wipe,
            storage::storage_encrypt,
            storage::storage_decrypt,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TiviHub");
}
