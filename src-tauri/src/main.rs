#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chromecast;
mod diagnostics;

use diagnostics::{BackendDiagnosticEvent, BackendDiagnostics};
use tauri::State;

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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            discover_cast_devices,
            cast_media,
            stop_cast,
            get_backend_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TiviHub");
}
