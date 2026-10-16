<p align="center">
  <img src="./public/icons/tivihub-192.png" width="80" alt="TiviHub logo">
</p>

<h1 align="center">TiviHub</h1>

<p align="center">
  <strong>A local-first desktop media hub.</strong><br>
  Organize and play media from sources you choose.
</p>

<p align="center">
  <a href="https://tivihub.nl">Website</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TiviHub/TiviHub/releases/latest">Latest release</a>
  &nbsp;·&nbsp;
  <a href="./LICENSE">MIT License</a>
</p>

TiviHub is a desktop player and library for user-configured M3U and Xtream-compatible sources. The public website at [`tivihub.nl`](https://tivihub.nl) is a static landing and download page; the player is bundled in a Windows installer and runs locally.

TiviHub does not provide playlists, channels, streams, or media.

## Features

- **Bring your own sources:** Import an M3U file or connect to an M3U URL or Xtream-compatible provider.
- **One organized library:** Browse live channels, TV guide data, movies, series, and episodes.
- **Playback and progress:** Play supported HLS and DASH streams, save favorites and watch progress, and continue where you left off.
- **Device-local data:** Keep sources, catalogs, favorites, playback progress, and settings on the device. Export or restore an encrypted backup to move data.
- **Personalize the player:** Choose a light, dark, or system theme.
- **Development-only demo:** A bundled sample playlist is available during local development and omitted from production builds.

Playback depends on provider authorization and availability, network access, CORS policy, supported formats and codecs, and the operating system's webview.

## Platform support

| Platform | Availability | Notes |
| --- | --- | --- |
| Windows 10/11, x64 | Installer available | Tauri desktop app using the system WebView2 runtime. |
| Linux | Not yet released | A package may follow after playback and distribution testing. |
| macOS | Not currently targeted | No installer is provided. |

The installer is currently unsigned. Windows may display an unknown-publisher or SmartScreen warning until a code-signing certificate is used.

Protected playback requires authorization and a DRM license service provided by the user's source. TiviHub does not provide licenses or bypass DRM or other access controls. DRM and codec support vary by provider, operating system, and device; test the exact streams on the intended platform.

## Privacy and local data

The installed player includes its UI and assets. It does not need to load from TiviHub hosting and has no TiviHub account service, application server, analytics, cloud sync, or automatic updater.

When a user connects a remote source, refreshes a playlist, plays media, or searches for subtitles, the app contacts the configured provider or subtitle service directly. Those services receive the request details and the user's network address. TiviHub does not proxy or relay those requests. The static website host may retain ordinary logs for page visits and installer downloads.

App data is local to the device and installation. Data from a previous browser-based version is not automatically transferred; export an encrypted backup there and import it in the desktop app. Clearing app data or losing the device can remove local data, so keep a backup if it matters. Local storage does not protect data from malware, a compromised operating-system account, or access to an unlocked device.

## Development

Install Node.js 20 or later. To run or package the native desktop app, install the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system. Windows builds require Rust and the Microsoft C++ build tools.

```sh
npm ci
npm run dev
```

`npm run dev` serves the landing page. To serve the player frontend in Vite, use `npm run dev:desktop`. To run it inside the native desktop shell, use:

```sh
npm run tauri:dev
```

Run validation with:

```sh
npm run typecheck
npm test
```

## Production builds

| Command | Output |
| --- | --- |
| `npm run build` | Prerendered static landing page in `dist/site/`. |
| `npm run build:desktop` | Bundled player frontend in `dist/desktop/`. |
| `npm run tauri:build` | Windows NSIS installer. |
| `npm run package:windows` | Windows installer, release assets, and website bundle. |

`npm run build` prerenders the landing page so its primary content is present in the static HTML for search crawlers. The download button points to the latest GitHub Release installer. `npm run package:windows` builds the installer, the website, and two release assets under `dist/releases/`: a versioned `TiviHub-v<version>-windows-x64.exe` and a stable `TiviHub-setup.exe` filename. Generated installers are not tracked in source control.

To deploy, upload the **contents** of `dist/site/` to the document root for `tivihub.nl` and enable HTTPS. No Node.js runtime, application server, or SPA rewrite is required on the host. The player UI and installer are not included in the website build.

## Releasing updates

TiviHub has no in-app update check. To publish a Windows update:

1. Set the same new version in `package.json` and `src-tauri/tauri.conf.json`.
2. Run `npm run typecheck`, `npm test`, and `npm run package:windows`; install and test the generated Windows installer.
3. Commit and push the version change, then create and push its matching tag, for example:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. The GitHub Actions release workflow verifies the tag matches both version files, builds and tests the Windows installer, then publishes a GitHub Release with a versioned installer and the stable `TiviHub-setup.exe` asset.
5. The website download button points to `https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe`; it follows the latest published stable release without requiring a website rebuild.

Users visit the website to check for updates and run the new installer over their current installation; they do not need to uninstall first. Adding in-app update checks would make the installed app contact a release host, so they remain disabled. Users should keep backups of important local data.

## Content and rights

TiviHub is a player and catalog organizer for sources users configure. It does not supply, sell, license, host, or verify channels or media. Users are responsible for accessing sources and content they are authorized to use and for complying with applicable law and provider terms. Third-party media, programme data, artwork, names, and trademarks remain the property of their respective owners.

## License

TiviHub is distributed under the [MIT License](./LICENSE). This license applies to the TiviHub software only and does not grant rights to third-party content or brands.
