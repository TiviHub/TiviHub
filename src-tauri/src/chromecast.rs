use std::{
    collections::BTreeMap,
    net::{IpAddr, Ipv4Addr},
    str::FromStr,
    time::{Duration, Instant},
};

use chromecast::{
    channels::{
        media::{GenericMediaMetadata, Media, Metadata, StreamType},
        receiver::CastDeviceApp,
    },
    CastDevice,
};
use mdns_sd::{RecvTimeoutError, ScopedIp, ServiceDaemon, ServiceEvent};
use serde::Serialize;
use url::Url;

const CAST_SERVICE_TYPE: &str = "_googlecast._tcp.local.";
const CAST_PORT: u16 = 8009;
const RECEIVER_ID: &str = "receiver-0";
const DISCOVERY_WINDOW: Duration = Duration::from_secs(3);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CastDeviceInfo {
    pub address: String,
    pub name: String,
}

pub fn discover_devices() -> Result<Vec<CastDeviceInfo>, String> {
    let daemon = ServiceDaemon::new()
        .map_err(|error| format!("Could not start Chromecast discovery: {error}"))?;
    let events = daemon
        .browse(CAST_SERVICE_TYPE)
        .map_err(|error| format!("Could not search for Chromecast devices: {error}"))?;
    let deadline = Instant::now() + DISCOVERY_WINDOW;
    let mut devices = BTreeMap::new();

    let scan_result = (|| {
        while Instant::now() < deadline {
            match events.recv_timeout(Duration::from_millis(200)) {
                Ok(ServiceEvent::ServiceResolved(service)) if service.port == CAST_PORT => {
                    let name = service
                        .fullname
                        .strip_suffix("._googlecast._tcp.local.")
                        .unwrap_or(&service.fullname)
                        .to_string();
                    for address in service.addresses.iter().filter_map(|scoped| match scoped {
                        ScopedIp::V4(address) => Some(*address.addr()),
                        _ => None,
                    }) {
                        if is_local_cast_address(address) {
                            devices
                                .entry(address.to_string())
                                .or_insert_with(|| CastDeviceInfo {
                                    address: address.to_string(),
                                    name: name.clone(),
                                });
                        }
                    }
                }
                Ok(_) | Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    return Err("Chromecast discovery stopped unexpectedly.".to_string());
                }
            }
        }
        Ok(())
    })();

    let stop_result = daemon
        .stop_browse(CAST_SERVICE_TYPE)
        .map_err(|error| format!("Could not stop Chromecast discovery: {error}"));
    let shutdown_result = daemon
        .shutdown()
        .map_err(|error| format!("Could not close Chromecast discovery: {error}"));
    scan_result?;
    stop_result?;
    shutdown_result?;

    let mut devices: Vec<_> = devices.into_values().collect();
    devices.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(devices)
}

pub fn cast_media(address: &str, stream_url: &str, title: &str, live: bool) -> Result<(), String> {
    let address = validate_cast_address(address)?;
    let media_url = validate_media_url(stream_url)?;
    if title.trim().is_empty() {
        return Err("A title is required to cast media.".to_string());
    }

    let device = CastDevice::connect(address.to_string(), CAST_PORT)
        .map_err(|error| format!("Could not securely connect to the Chromecast: {error}"))?;
    device
        .connection
        .connect(RECEIVER_ID.to_string())
        .map_err(|error| format!("Could not open the Chromecast receiver: {error}"))?;
    let app = device
        .receiver
        .launch_app(&CastDeviceApp::DefaultMediaReceiver)
        .map_err(|error| format!("Could not start the Chromecast media receiver: {error}"))?;
    device
        .connection
        .connect(app.transport_id.as_str())
        .map_err(|error| format!("Could not connect to the Chromecast media receiver: {error}"))?;
    device
        .media
        .load(
            app.transport_id.as_str(),
            app.session_id.as_str(),
            &Media {
                content_id: media_url.to_string(),
                content_type: content_type(&media_url),
                stream_type: if live {
                    StreamType::Live
                } else {
                    StreamType::Buffered
                },
                duration: None,
                metadata: Some(Metadata::Generic(GenericMediaMetadata {
                    title: Some(title.to_string()),
                    subtitle: None,
                    images: Vec::new(),
                    release_date: None,
                })),
            },
        )
        .map_err(|error| format!("The Chromecast could not load this stream: {error}"))?;

    Ok(())
}

pub fn stop_cast(address: &str) -> Result<(), String> {
    let address = validate_cast_address(address)?;
    let device = CastDevice::connect(address.to_string(), CAST_PORT)
        .map_err(|error| format!("Could not securely connect to the Chromecast: {error}"))?;
    device
        .connection
        .connect(RECEIVER_ID.to_string())
        .map_err(|error| format!("Could not connect to the Chromecast receiver: {error}"))?;
    let status = device
        .receiver
        .get_status()
        .map_err(|error| format!("Could not get the Chromecast playback status: {error}"))?;
    let app = status
        .applications
        .iter()
        .find(|app| app.app_id == "CC1AD845")
        .ok_or_else(|| "TiviHub is not currently casting to this device.".to_string())?;
    device
        .receiver
        .stop_app(app.session_id.as_str())
        .map_err(|error| format!("Could not stop playback on the Chromecast: {error}"))
}

fn validate_cast_address(address: &str) -> Result<Ipv4Addr, String> {
    let address = IpAddr::from_str(address)
        .map_err(|_| "The selected Chromecast address is invalid.".to_string())?;
    match address {
        IpAddr::V4(address) if is_local_cast_address(address) => Ok(address),
        _ => Err(
            "Only discovered Chromecast devices on a local IPv4 network are supported.".to_string(),
        ),
    }
}

fn is_local_cast_address(address: Ipv4Addr) -> bool {
    address.is_private() || address.is_link_local()
}

fn validate_media_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "The media URL is invalid.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err("Only HTTP or HTTPS media URLs can be cast.".to_string());
    }
    Ok(url)
}

fn content_type(url: &Url) -> String {
    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".m3u8") {
        "application/x-mpegURL".to_string()
    } else if path.ends_with(".mpd") {
        "application/dash+xml".to_string()
    } else if path.ends_with(".mp4") || path.ends_with(".m4v") {
        "video/mp4".to_string()
    } else if path.ends_with(".ts") {
        "video/mp2t".to_string()
    } else if path.ends_with(".webm") {
        "video/webm".to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{content_type, is_local_cast_address, validate_cast_address, validate_media_url};
    use std::net::Ipv4Addr;
    use url::Url;

    #[test]
    fn limits_cast_targets_to_private_or_link_local_ipv4() {
        assert!(validate_cast_address("192.168.1.25").is_ok());
        assert!(validate_cast_address("10.0.0.12").is_ok());
        assert!(validate_cast_address("169.254.1.3").is_ok());
        assert!(validate_cast_address("8.8.8.8").is_err());
        assert!(validate_cast_address("127.0.0.1").is_err());
        assert!(!is_local_cast_address(Ipv4Addr::new(8, 8, 8, 8)));
    }

    #[test]
    fn only_accepts_absolute_http_media_urls() {
        assert!(validate_media_url("https://provider.example/live/1.m3u8").is_ok());
        assert!(validate_media_url("file:///C:/private.m3u").is_err());
        assert!(validate_media_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn selects_cast_mime_types_from_media_url_paths() {
        assert_eq!(
            content_type(&Url::parse("https://provider.example/live.m3u8").unwrap()),
            "application/x-mpegURL",
        );
        assert_eq!(
            content_type(&Url::parse("https://provider.example/movie.mp4?token=1").unwrap()),
            "video/mp4",
        );
        assert_eq!(
            content_type(&Url::parse("https://provider.example/stream.ts").unwrap()),
            "video/mp2t",
        );
    }
}
