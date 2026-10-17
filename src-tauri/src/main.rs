#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chromecast;

#[tauri::command]
async fn discover_cast_devices() -> Result<Vec<chromecast::CastDeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(chromecast::discover_devices)
        .await
        .map_err(|error| format!("Chromecast discovery task failed: {error}"))?
}

#[tauri::command]
async fn cast_media(
    address: String,
    stream_url: String,
    title: String,
    live: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        chromecast::cast_media(&address, &stream_url, &title, live)
    })
    .await
    .map_err(|error| format!("Chromecast playback task failed: {error}"))?
}

#[tauri::command]
async fn stop_cast(address: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || chromecast::stop_cast(&address))
        .await
        .map_err(|error| format!("Chromecast stop task failed: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            discover_cast_devices,
            cast_media,
            stop_cast,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TiviHub");
}
