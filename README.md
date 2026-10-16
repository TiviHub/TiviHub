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
  <a href="https://github.com/TiviHub/TiviHub/releases/download/v1.0.0-beta.1/TiviHub-setup.exe">Download for Windows</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TiviHub/TiviHub/releases">All releases</a>
  &nbsp;·&nbsp;
  <a href="./LICENSE">MIT License</a>
</p>

TiviHub brings the media sources you configure into one desktop library. Browse live channels and guide data, movies, series, and episodes, then keep favorites and playback progress together on your device.

TiviHub is a player and organizer, not a content service. It does not provide playlists, channels, streams, or media. You bring sources you are authorized to use.

## What you can do

- **Connect your sources:** Import an M3U file or URL, or configure an Xtream-compatible source.
- **Keep your library organized:** Browse live TV, programme guide data, movies, series, and episodes in one place.
- **Pick up where you left off:** Save favorites and playback progress on your device.
- **Make it yours:** Choose a light, dark, or system theme.
- **Back up your data:** Export and restore an encrypted backup when moving to another device.

Playback supports compatible HLS and DASH streams. Whether a particular stream works depends on your provider, authorization, network, CORS policy, codecs, and Windows WebView2.

## Download

**[Download TiviHub v1.0.0-beta.1 for Windows 10/11 (64-bit)](https://github.com/TiviHub/TiviHub/releases/download/v1.0.0-beta.1/TiviHub-setup.exe)**

This is an early beta, so features may change and you may encounter issues. The installer is unsigned; Windows may show an unknown-publisher or SmartScreen warning.

Windows is currently the only released platform. Linux is not available yet, and macOS is not currently targeted. Visit [GitHub Releases](https://github.com/TiviHub/TiviHub/releases) for the current installer and release notes.

## Privacy and local data

The installed player runs with its interface and assets bundled. It has no TiviHub account, application server, analytics, cloud sync, or automatic updater. Sources, catalogs, favorites, playback progress, and settings are stored locally on your device.

When you connect a remote source, refresh content, play media, or search for subtitles, TiviHub connects directly to the provider or subtitle service you configured. Those services receive the request and your network address; TiviHub does not proxy or relay it. Installer downloads are served by GitHub, not by the TiviHub website host.

Keep backups of important data. Clearing app data or losing access to your device can remove your local library. Local storage does not protect data from malware, a compromised operating-system account, or access to an unlocked device.

## Playback and content

Protected playback requires authorization and a DRM license service from your source. DRM and codec support vary by provider and device. TiviHub does not supply licenses or bypass DRM or other access controls.

You are responsible for using sources and content you are authorized to access and for following applicable law and provider terms. Third-party media, programme data, artwork, names, and trademarks remain the property of their respective owners.

## Open source and contributions

The source code is public so you can inspect how TiviHub works. **You do not need to build it yourself to use the app**—download the Windows installer above.

Suggestions, bug reports, and code contributions are welcome. Open an issue to discuss a change or submit a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor guidance and [SECURITY.md](./SECURITY.md) for reporting security issues privately.

## License

TiviHub software is distributed under the [MIT License](./LICENSE). This license applies to the software only and does not grant rights to third-party content or brands.
