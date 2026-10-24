<p align="center">
  <img src="./public/icons/tivihub-192.png" width="80" alt="TiviHub logo">
</p>

<h1 align="center">TiviHub</h1>

<p align="center">
  <strong>Your media, organized your way.</strong><br>
  An open-source desktop player for sources you choose.
</p>

<p align="center">
  <a href="https://tivihub.nl">Website</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe">Download for Windows</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TiviHub/TiviHub/releases">All releases</a>
  &nbsp;·&nbsp;
  <a href="./LICENSE">MIT License</a>
</p>

<p align="center">
  <a href="https://github.com/TiviHub/TiviHub/actions/workflows/ci.yml"><img alt="Build status" src="https://github.com/TiviHub/TiviHub/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/TiviHub/TiviHub/actions/workflows/release.yml"><img alt="Release workflow status" src="https://github.com/TiviHub/TiviHub/actions/workflows/release.yml/badge.svg?event=push"></a>
  <a href="https://github.com/TiviHub/TiviHub/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/TiviHub/TiviHub?display_name=tag"></a>
</p>

TiviHub brings the media sources you configure into one desktop library. Browse live channels and guide data, movies, series, and episodes, then keep favorites and playback progress together on your device.

TiviHub is a player and organizer, not a content service. It does not provide playlists, channels, streams, or media. You bring sources you are authorized to use.

## What you can do

- **Connect your sources:** Import an M3U file or URL, configure an Xtream-compatible source, or (desktop app) add a Stalker portal with its address and MAC address.
- **Keep catalogs ready:** Remote catalogs are cached on your device and refresh automatically every 24 hours; you can refresh them manually at any time.
- **Keep your library organized:** Browse live TV, programme guide data, movies, series, and episodes by category in one place. Movies and series load a category at a time, so large providers open fast.
- **Watch what you missed:** On channels whose provider keeps recordings (Xtream archive or M3U `catchup`), finished programmes in the TV guide open the recording, and the programme on air can start over.
- **Listen to radio:** Stations marked as radio in the playlist get their own filter and play as audio.
- **Take it offline:** Save direct, unprotected movies and episodes (up to 8 GB each) for offline playback.
- **Fix what will not play:** (Desktop app) Hand a stream to VLC or mpv when the built-in player cannot play it, and set a custom User-Agent per playlist for providers that need one.
- **Pick up where you left off:** Save favorites and playback progress on your device.
- **Cast to Google Cast devices:** Send compatible, unprotected streams directly from the provider to a Chromecast on your local network.
- **Watch several channels:** Open up to four live channels side by side in multiview (plain streams only; no DRM or portal channels).
- **Never miss a programme:** Set a reminder on a TV guide programme and get a message, or a system notification, a minute before it starts.
- **Make it yours:** Choose a light, dark, or system theme, and use TiviHub in English, Dutch, Spanish, French, German, Portuguese or Turkish.
- **Keep adult content behind a PIN:** Hide adult titles, and ask for a PIN before they are shown (a child lock, not strong security).
- **Back up your data:** Export and restore an encrypted backup when moving to another device.

Playback supports compatible HLS and DASH streams. Whether a particular stream works depends on your provider, authorization, network, CORS policy, and the platform's media runtime and codecs (WebView2 on Windows).

## Download

**[Download the latest TiviHub for Windows 10/11 (64-bit)](https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe)**

The latest release includes the Windows 10/11 x64 installer, Linux x64 AppImage and `.deb` packages, and macOS arm64 and x64 `.dmg` packages. Visit [GitHub Releases](https://github.com/TiviHub/TiviHub/releases) to choose a package and read the release notes.

## Privacy and local data

The installed player runs with its interface and assets bundled. It has no TiviHub account, application server, analytics, cloud sync, or automatic installer. The app checks the public GitHub Releases API for updates; it does not send playlists or library data in that request, and updates are downloaded and installed manually.

When you check for updates, GitHub receives a request from your network address. When you connect a remote source, refresh content, play media, search for subtitles, or open a movie or series with an MDBList key configured, TiviHub connects directly to the provider or subtitle service you configured. Those services receive the request and your network address; No TiviHub server proxies or relays it; in the desktop app the request is made by the app on your device. Installer downloads are served by GitHub, not by the TiviHub website host.

When you cast, TiviHub sends the stream URL over your local network to the selected Chromecast, which then requests the stream directly from your provider. URLs may contain provider credentials. Only cast to devices you trust and that are on your local network.

Keep backups of important data. Clearing app data or losing access to your device can remove your local library. Local storage does not protect data from malware, a compromised operating-system account, or access to an unlocked device.

## Playback and content

Protected playback requires authorization and a DRM license service from your source. DRM and codec support vary by provider and device. TiviHub does not supply licenses or bypass DRM or other access controls.

Google Cast supports unprotected streams only. The Chromecast must be able to reach the provider and support the stream format; provider CORS or network restrictions may prevent playback. Cast playback progress and external subtitle selections are not synchronized to TiviHub.

You are responsible for using sources and content you are authorized to access and for following applicable law and provider terms. Third-party media, programme data, artwork, names, and trademarks remain the property of their respective owners.

## Open source and contributions

The source code is public so you can inspect how TiviHub works. **You do not need to build it yourself to use the app**—download the package for your platform from [GitHub Releases](https://github.com/TiviHub/TiviHub/releases).

Suggestions, bug reports, and code contributions are welcome. Open an issue to discuss a change or submit a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor guidance and [SECURITY.md](./SECURITY.md) for reporting security issues privately.

## License

TiviHub software is distributed under the [MIT License](./LICENSE). This license applies to the software only and does not grant rights to third-party content or brands.
