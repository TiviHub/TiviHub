//! Requests that carry headers a web view cannot set (User-Agent, Cookie, Authorization).
//!
//! Two entry points: `http_fetch` for playlist, guide and portal requests, and a loopback proxy
//! for streams. The page never supplies headers to the proxy: it registers a header set once, gets
//! a secret token, and the proxy adds those headers to every request made with that token.

use std::{
    collections::HashMap,
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use tauri::State;
use url::{Host, Url};

const MAX_FETCH_BYTES: u64 = 200 * 1024 * 1024;
const MAX_PROFILES: usize = 256;
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const ALLOWED_HEADERS: &[&str] = &[
    "user-agent",
    "cookie",
    "authorization",
    "accept",
    "accept-language",
    "referer",
    "x-user-agent",
    "content-type",
];
const PASSED_BACK_HEADERS: &[&str] = &["content-type", "content-range", "accept-ranges"];

/// Where requests may go. Loopback is only allowed in tests, so the proxy and the fetch command
/// can never be pointed at services on this computer (including the proxy itself).
#[derive(Clone, Copy)]
pub struct Policy {
    pub allow_loopback: bool,
}

pub const POLICY: Policy = Policy {
    allow_loopback: false,
};

fn blocked_ip(ip: IpAddr, policy: Policy) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_unspecified()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || (!policy.allow_loopback && v4.is_loopback())
        }
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => blocked_ip(IpAddr::V4(v4), policy),
            None => {
                v6.is_unspecified()
                    || v6.is_multicast()
                    || (v6.segments()[0] & 0xffc0) == 0xfe80
                    || (!policy.allow_loopback && v6.is_loopback())
            }
        },
    }
}

/// Only http and https, and never loopback, link-local or multicast addresses. Host names are
/// resolved here so a name that points at this computer is refused too.
pub fn check_target(url: &Url, policy: Policy) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS addresses can be requested.".to_string());
    }
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "The address has no port.".to_string())?;
    let blocked = || "That address is not allowed.".to_string();
    match url.host() {
        None => Err("The address has no host.".to_string()),
        Some(Host::Ipv4(ip)) => (!blocked_ip(IpAddr::V4(ip), policy))
            .then_some(())
            .ok_or_else(blocked),
        Some(Host::Ipv6(ip)) => (!blocked_ip(IpAddr::V6(ip), policy))
            .then_some(())
            .ok_or_else(blocked),
        Some(Host::Domain(name)) => {
            let addresses = (name, port)
                .to_socket_addrs()
                .map_err(|_| "The host name could not be found.".to_string())?;
            for address in addresses {
                if blocked_ip(address.ip(), policy) {
                    return Err(blocked());
                }
            }
            Ok(())
        }
    }
}

fn client(policy: Policy) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                attempt.error("Too many redirects.")
            } else if check_target(attempt.url(), policy).is_err() {
                attempt.error("The redirect leads to an address that is not allowed.")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

fn allowed_headers(headers: &[(String, String)]) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(name, value)| {
            ALLOWED_HEADERS.contains(&name.to_ascii_lowercase().as_str())
                && !value.contains(['\r', '\n'])
                && value.len() <= 4096
        })
        .cloned()
        .collect()
}

// ---- http_fetch ------------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    url: String,
    method: Option<String>,
    #[serde(default)]
    headers: Vec<(String, String)>,
    body: Option<String>,
    max_bytes: Option<u64>,
}

#[derive(Serialize, Debug)]
pub struct FetchResponse {
    status: u16,
    headers: Vec<(String, String)>,
    /// Base64, so binary guides (for example gzip) survive the trip to the page.
    body: String,
}

pub fn fetch(request: FetchRequest, policy: Policy) -> Result<FetchResponse, String> {
    let url = Url::parse(&request.url).map_err(|_| "The address is not valid.".to_string())?;
    check_target(&url, policy)?;
    let limit = request
        .max_bytes
        .unwrap_or(MAX_FETCH_BYTES)
        .min(MAX_FETCH_BYTES);
    let method = match request.method.as_deref().unwrap_or("GET") {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err("Only GET and POST requests are supported.".to_string()),
    };
    let mut builder = client(policy)?.request(method, url).timeout(FETCH_TIMEOUT);
    for (name, value) in allowed_headers(&request.headers) {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder.send().map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        return Err("The response is larger than the allowed size.".to_string());
    }
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_string())))
        .collect();
    let mut bytes = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("The response is larger than the allowed size.".to_string());
    }
    Ok(FetchResponse {
        status,
        headers,
        body: B64.encode(bytes),
    })
}

#[tauri::command]
pub async fn http_fetch(request: FetchRequest) -> Result<FetchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(request, POLICY))
        .await
        .map_err(|_| "The request could not be completed.".to_string())?
}

// ---- stream proxy ----------------------------------------------------------------------------

type Profiles = Arc<Mutex<HashMap<String, Vec<(String, String)>>>>;

#[derive(Default)]
pub struct ProxyState {
    port: Mutex<Option<u16>>,
    profiles: Profiles,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRegistration {
    /// `http://127.0.0.1:<port>/p/<token>`; the page appends `?u=<encoded target>`.
    base_url: String,
}

fn random_token() -> String {
    use aes_gcm::aead::{rand_core::RngCore, OsRng};
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl ProxyState {
    fn ensure_running(&self, policy: Policy) -> Result<u16, String> {
        let mut port = self.port.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(port) = *port {
            return Ok(port);
        }
        let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
        let bound = server
            .server_addr()
            .to_ip()
            .ok_or_else(|| "The stream proxy could not start.".to_string())?
            .port();
        let profiles = Arc::clone(&self.profiles);
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                let profiles = Arc::clone(&profiles);
                std::thread::spawn(move || handle(request, &profiles, bound, policy));
            }
        });
        *port = Some(bound);
        Ok(bound)
    }

    pub fn register(
        &self,
        headers: &[(String, String)],
        policy: Policy,
    ) -> Result<ProxyRegistration, String> {
        let port = self.ensure_running(policy)?;
        let token = random_token();
        let mut profiles = self.profiles.lock().unwrap_or_else(|e| e.into_inner());
        if profiles.len() >= MAX_PROFILES {
            profiles.clear();
        }
        profiles.insert(token.clone(), allowed_headers(headers));
        Ok(ProxyRegistration {
            base_url: format!("http://127.0.0.1:{port}/p/{token}"),
        })
    }
}

#[tauri::command]
pub fn proxy_register(
    state: State<'_, ProxyState>,
    headers: Vec<(String, String)>,
) -> Result<ProxyRegistration, String> {
    state.register(&headers, POLICY)
}

fn header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes())
        .expect("header names and values are ASCII")
}

fn cors_headers() -> Vec<tiny_http::Header> {
    vec![
        header("Access-Control-Allow-Origin", "*"),
        header("Access-Control-Allow-Headers", "range, content-type"),
        header("Access-Control-Allow-Methods", "GET, OPTIONS"),
        header(
            "Access-Control-Expose-Headers",
            "content-length, content-range, accept-ranges, content-type",
        ),
    ]
}

fn refuse(request: tiny_http::Request, status: u16) {
    let _ = request.respond(
        tiny_http::Response::empty(tiny_http::StatusCode(status))
            .with_header(header("Access-Control-Allow-Origin", "*")),
    );
}

fn handle(request: tiny_http::Request, profiles: &Profiles, port: u16, policy: Policy) {
    if *request.method() == tiny_http::Method::Options {
        let mut response = tiny_http::Response::empty(tiny_http::StatusCode(204));
        for h in cors_headers() {
            response.add_header(h);
        }
        let _ = request.respond(response);
        return;
    }
    // A page on another site could make a request to this port; only our own host name is served,
    // which also stops DNS rebinding.
    let host_ok = request.headers().iter().any(|h| {
        h.field.equiv("Host")
            && (h.value.as_str() == format!("127.0.0.1:{port}")
                || h.value.as_str() == format!("localhost:{port}"))
    });
    if !host_ok || *request.method() != tiny_http::Method::Get {
        return refuse(request, 403);
    }
    let Ok(url) = Url::parse(&format!("http://127.0.0.1{}", request.url())) else {
        return refuse(request, 400);
    };
    let token = url
        .path()
        .strip_prefix("/p/")
        .unwrap_or_default()
        .to_string();
    let Some(headers) = profiles
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&token)
        .cloned()
    else {
        return refuse(request, 403);
    };
    let Some(target) = url
        .query_pairs()
        .find(|(key, _)| key == "u")
        .and_then(|(_, value)| Url::parse(&value).ok())
    else {
        return refuse(request, 400);
    };
    if check_target(&target, policy).is_err() {
        return refuse(request, 403);
    }
    let Ok(client) = client(policy) else {
        return refuse(request, 502);
    };
    let mut upstream = client.get(target);
    for (name, value) in headers {
        upstream = upstream.header(name, value);
    }
    for h in request.headers() {
        if h.field.equiv("Range") {
            upstream = upstream.header("Range", h.value.as_str());
        }
    }
    let Ok(response) = upstream.send() else {
        return refuse(request, 502);
    };
    let status = response.status().as_u16();
    let length = response.content_length().map(|length| length as usize);
    let mut headers = cors_headers();
    for name in PASSED_BACK_HEADERS {
        if let Some(value) = response.headers().get(*name).and_then(|v| v.to_str().ok()) {
            headers.push(header(name, value));
        }
    }
    let _ = request.respond(tiny_http::Response::new(
        tiny_http::StatusCode(status),
        headers,
        response,
        length,
        None,
    ));
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOOPBACK: Policy = Policy {
        allow_loopback: true,
    };

    /// A tiny upstream: `/echo` returns the request's User-Agent and Cookie, `/big` returns 4 KB,
    /// and `/range` returns bytes 0-9 of a 100-byte body when asked for a range.
    fn upstream() -> u16 {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                let value = |name: &str| {
                    request
                        .headers()
                        .iter()
                        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
                        .map(|h| h.value.to_string())
                        .unwrap_or_default()
                };
                let body = match request.url() {
                    "/echo" => format!("ua={};cookie={}", value("User-Agent"), value("Cookie")),
                    "/big" => "x".repeat(4096),
                    _ => "0123456789".repeat(10),
                };
                if request.url() == "/range" && !value("Range").is_empty() {
                    let response = tiny_http::Response::from_string(&body[..10])
                        .with_status_code(206)
                        .with_header(header("Content-Range", "bytes 0-9/100"));
                    let _ = request.respond(response);
                } else {
                    let _ = request.respond(tiny_http::Response::from_string(body));
                }
            }
        });
        port
    }

    fn fetch_text(
        port: u16,
        path: &str,
        headers: Vec<(&str, &str)>,
        max: Option<u64>,
    ) -> Result<String, String> {
        let response = fetch(
            FetchRequest {
                url: format!("http://127.0.0.1:{port}{path}"),
                method: None,
                headers: headers
                    .into_iter()
                    .map(|(a, b)| (a.into(), b.into()))
                    .collect(),
                body: None,
                max_bytes: max,
            },
            LOOPBACK,
        )?;
        Ok(String::from_utf8(B64.decode(response.body).unwrap()).unwrap())
    }

    fn encoded(target: &str) -> String {
        url::form_urlencoded::byte_serialize(target.as_bytes()).collect()
    }

    #[test]
    fn refuses_loopback_link_local_and_non_http_targets() {
        for blocked in [
            "http://127.0.0.1/x",
            "http://localhost:8080/x",
            "http://[::1]/x",
            "http://169.254.169.254/latest/meta-data",
            "http://0.0.0.0/x",
            "http://[::ffff:127.0.0.1]/x",
            "file:///C:/secret.txt",
            "ftp://host/file",
        ] {
            assert!(
                check_target(&Url::parse(blocked).unwrap(), POLICY).is_err(),
                "{blocked}"
            );
        }
        assert!(check_target(&Url::parse("http://192.168.1.20:8080/x").unwrap(), POLICY).is_ok());
        assert!(check_target(&Url::parse("https://93.184.216.34/x").unwrap(), POLICY).is_ok());
    }

    #[test]
    fn only_passes_allowed_headers_without_line_breaks() {
        let headers = vec![
            ("User-Agent".to_string(), "Custom/1".to_string()),
            ("Host".to_string(), "evil.example".to_string()),
            ("Cookie".to_string(), "a=b\r\nX-Injected: 1".to_string()),
            ("Authorization".to_string(), "Bearer t".to_string()),
        ];
        let kept = allowed_headers(&headers);
        assert_eq!(kept.len(), 2);
        assert!(kept.iter().any(|(n, _)| n == "User-Agent"));
        assert!(kept.iter().any(|(n, _)| n == "Authorization"));
    }

    #[test]
    fn fetch_sends_the_headers_and_enforces_the_size_limit() {
        let port = upstream();
        let text = fetch_text(
            port,
            "/echo",
            vec![("User-Agent", "Custom/1"), ("Cookie", "mac=AA")],
            None,
        )
        .unwrap();
        assert_eq!(text, "ua=Custom/1;cookie=mac=AA");
        assert!(fetch_text(port, "/big", vec![], Some(1024)).is_err());
        assert_eq!(
            fetch_text(port, "/big", vec![], Some(8192)).unwrap().len(),
            4096
        );
    }

    #[test]
    fn fetch_is_blocked_from_loopback_under_the_real_policy() {
        let port = upstream();
        let result = fetch(
            FetchRequest {
                url: format!("http://127.0.0.1:{port}/echo"),
                method: None,
                headers: vec![],
                body: None,
                max_bytes: None,
            },
            POLICY,
        );
        assert!(result.is_err());
    }

    #[test]
    fn the_proxy_adds_the_registered_headers_and_passes_ranges_through() {
        let port = upstream();
        let state = ProxyState::default();
        let registration = state
            .register(&[("User-Agent".into(), "Custom/1".into())], LOOPBACK)
            .unwrap();
        let client = reqwest::blocking::Client::new();

        let echoed = client
            .get(format!(
                "{}?u={}",
                registration.base_url,
                encoded(&format!("http://127.0.0.1:{port}/echo"))
            ))
            .send()
            .unwrap();
        assert_eq!(echoed.status(), 200);
        assert_eq!(echoed.headers()["access-control-allow-origin"], "*");
        assert_eq!(echoed.text().unwrap(), "ua=Custom/1;cookie=");

        let partial = client
            .get(format!(
                "{}?u={}",
                registration.base_url,
                encoded(&format!("http://127.0.0.1:{port}/range"))
            ))
            .header("Range", "bytes=0-9")
            .send()
            .unwrap();
        assert_eq!(partial.status(), 206);
        assert_eq!(partial.headers()["content-range"], "bytes 0-9/100");
        assert_eq!(partial.text().unwrap(), "0123456789");
    }

    #[test]
    fn the_proxy_needs_a_known_token_and_our_own_host_name() {
        let port = upstream();
        let state = ProxyState::default();
        let registration = state.register(&[], LOOPBACK).unwrap();
        let base = registration
            .base_url
            .rsplit_once("/p/")
            .unwrap()
            .0
            .to_string();
        let target = encoded(&format!("http://127.0.0.1:{port}/echo"));

        let unknown =
            reqwest::blocking::get(format!("{base}/p/{}?u={target}", "0".repeat(32))).unwrap();
        assert_eq!(unknown.status(), 403);

        let wrong_host = reqwest::blocking::Client::new()
            .get(format!("{}?u={target}", registration.base_url))
            .header("Host", "evil.example")
            .send()
            .unwrap();
        assert_eq!(wrong_host.status(), 403);
    }

    #[test]
    fn the_proxy_refuses_loopback_targets_under_the_real_policy() {
        let port = upstream();
        let state = ProxyState::default();
        let registration = state.register(&[], POLICY).unwrap();
        let response = reqwest::blocking::get(format!(
            "{}?u={}",
            registration.base_url,
            encoded(&format!("http://127.0.0.1:{port}/echo"))
        ))
        .unwrap();
        assert_eq!(response.status(), 403);
    }
}
