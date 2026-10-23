//! Opens a stream in VLC or mpv when the built-in player cannot play it (for example AC-3 audio,
//! which the web view cannot decode). Only these two programs are ever started, with the address
//! as a separate argument, and only for http and https addresses.

use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use url::Url;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    Vlc,
    Mpv,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Kind::Vlc => "VLC",
            Kind::Mpv => "mpv",
        }
    }
}

/// Only an absolute http or https address can be handed over; this also keeps anything that looks
/// like a command line option out of the arguments.
fn stream_address(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "The stream address is not valid.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err("Only HTTP and HTTPS streams can be opened in another player.".to_string());
    }
    Ok(url)
}

fn user_agent_value(user_agent: Option<&str>) -> Option<String> {
    user_agent
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains(['\r', '\n']) && value.len() <= 256)
        .map(str::to_string)
}

fn arguments(kind: Kind, url: &Url, user_agent: Option<&str>) -> Vec<String> {
    let mut arguments = Vec::new();
    if let Some(agent) = user_agent_value(user_agent) {
        arguments.push(match kind {
            Kind::Vlc => format!("--http-user-agent={agent}"),
            Kind::Mpv => format!("--user-agent={agent}"),
        });
    }
    arguments.push(url.to_string());
    arguments
}

fn on_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .flat_map(|directory| [directory.join(name), directory.join(format!("{name}.exe"))])
        .find(|candidate| candidate.is_file())
}

fn find_player() -> Option<(Kind, PathBuf)> {
    let installed = [
        (Kind::Vlc, r"C:\Program Files\VideoLAN\VLC\vlc.exe"),
        (Kind::Vlc, r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"),
        (Kind::Vlc, "/Applications/VLC.app/Contents/MacOS/VLC"),
    ];
    for (kind, path) in installed {
        if Path::new(path).is_file() {
            return Some((kind, PathBuf::from(path)));
        }
    }
    on_path("vlc")
        .map(|path| (Kind::Vlc, path))
        .or_else(|| on_path("mpv").map(|path| (Kind::Mpv, path)))
}

#[tauri::command]
pub fn open_in_external_player(url: String, user_agent: Option<String>) -> Result<String, String> {
    let address = stream_address(&url)?;
    let (kind, program) = find_player()
        .ok_or_else(|| "No external player found. Install VLC or mpv and try again.".to_string())?;
    Command::new(program)
        .args(arguments(kind, &address, user_agent.as_deref()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| format!("{} could not be started.", kind.name()))?;
    Ok(kind.name().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_and_https_addresses_are_handed_over() {
        assert!(stream_address("https://host.example/play.php?x=1").is_ok());
        assert!(stream_address("http://192.168.1.5:8080/live/1.ts").is_ok());
        for refused in [
            "file:///C:/Windows/System32/calc.exe",
            "--fullscreen",
            "-I rc",
            "ftp://host/file",
            "javascript:alert(1)",
            "",
        ] {
            assert!(stream_address(refused).is_err(), "{refused}");
        }
    }

    #[test]
    fn the_address_is_always_a_separate_argument() {
        let url = stream_address("https://host.example/a b?x=1&y=2").unwrap();
        let vlc = arguments(Kind::Vlc, &url, Some("My Agent/1.0"));
        assert_eq!(vlc, vec!["--http-user-agent=My Agent/1.0", url.as_str()]);
        let mpv = arguments(Kind::Mpv, &url, Some("My Agent/1.0"));
        assert_eq!(mpv, vec!["--user-agent=My Agent/1.0", url.as_str()]);
        assert_eq!(arguments(Kind::Vlc, &url, None), vec![url.as_str()]);
    }

    #[test]
    fn a_user_agent_with_line_breaks_or_nothing_in_it_is_left_out() {
        let url = stream_address("https://host.example/a").unwrap();
        for agent in [Some("bad\r\nagent"), Some("   "), Some(""), None] {
            assert_eq!(arguments(Kind::Mpv, &url, agent), vec![url.as_str()]);
        }
    }
}
