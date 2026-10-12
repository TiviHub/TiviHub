# TiviHub

TiviHub is a native Android IPTV player for organizing and watching content from playlists you provide. It brings live TV, movies, series, a personal library, and programme information together in a content-first interface.

> **TiviHub does not provide or host channels, movies, series, playlists, or streams.** Add only sources that you are authorized to access and use. You are responsible for complying with applicable law and the terms of your providers.

## Features

- **M3U/M3U8 playlists** for live TV channels, groups, and logos.
- **Xtream Codes playlists** for live TV, movies, series, episodes, and provider metadata.
- **TV Guide** with cached XMLTV programme data when provided by the active Xtream source.
- **Catalog browsing** with search, categories, title details, and metadata-aware sorting. Recently added is the default; rating and year sorts appear only when the provider supplies that data.
- **Media3/ExoPlayer playback**, including HLS, DASH, and compatible Widevine DRM sources.
- **Playback progress and resume** for movies and episodes.
- **Embedded subtitles** and optional subtitle search/download using your own OpenSubtitles API key.
- **Favorites and Library** for live channels, saved movies, and series.
- **Local caching and refresh controls** for catalogs and EPG data.
- **Material 3 interface** with system, light, and dark themes.
- **Android 8.0+ support**; browsing is portrait-oriented, with device orientation available during playback.

Features and metadata depend on the playlist provider, content, device, and network.

## Download

Open the repository's **Releases** page and download the versioned `TiviHub-vX.Y.Z.apk` asset from the release you want. The matching SHA-256 checksum file is attached to each release.

To install an APK, download it to your Android device and allow installation from the browser or file manager when Android asks. Android may show a warning because the APK is installed outside Google Play. APK updates from this project must be signed with the same release key; uninstalling first may remove local app data.

Only download release APKs from this repository's official Releases page. Check the published checksum if you need to verify that the file matches the release asset.

## Requirements

- Android 8.0 (API 26) or later to run the app.
- JDK 17 to build.
- Android SDK Platform 36 (installed automatically by Android Studio, or available through the Android SDK command-line tools).
- A playlist or provider account that you are authorized to use.

## Build from source

The Android Gradle project is at the repository root. Open this folder in Android Studio, or build from PowerShell on Windows:

```powershell
.\gradlew.bat :app:assembleDebug
```

The debug APK is created at `app\build\outputs\apk\debug\app-debug.apk`. Install it on a connected device or emulator with:

```powershell
.\gradlew.bat :app:installDebug
```

Build and install using the Gradle wrapper; a separate Gradle installation is not required. The first build downloads the Gradle distribution, Android Gradle Plugin, and Android dependencies.

### Tests and lint

Run the same checks used by GitHub Actions:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Tests cover playlist parsing, Xtream URL construction and metadata, XMLTV parsing, subtitle API behavior, and other network/data behavior.

## Releases and versioning

GitHub Actions runs tests, lint, and a debug build for pushes and pull requests. A push to `main` also builds and verifies a signed release APK; download it with its SHA-256 checksum from that run's **Artifacts** section. These main-branch artifacts are retained for 14 days. Creating and pushing a version tag matching `vX.Y.Z` triggers a release build after verification and publishes it on the repository's **Releases** page. For example:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

The tag becomes the release's version name (`v1.0.1`); GitHub Actions assigns a monotonically increasing Android version code. The workflow builds and verifies a signed release APK, creates a SHA-256 checksum, and attaches both files to a GitHub Release with generated release notes. Main-branch APKs use version name `1.0.0` and a unique version code for each workflow run.

### One-time release signing setup

To make APKs installable and upgradeable without changing signing identity, configure a dedicated Android release keystore as GitHub Actions repository secrets. **Never commit the keystore, its passwords, or a base64 copy to this repository.** Keep an offline backup of the keystore and its credentials; losing them prevents signing compatible updates.

1. Create a dedicated keystore on a trusted machine. Keep it outside the repository:

   ```powershell
   keytool -genkeypair -v `
     -keystore "$HOME\tivihub-release.p12" `
     -alias tivihub-release `
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. In the repository's **Settings → Secrets and variables → Actions**, add:
   - `TIVIHUB_RELEASE_KEYSTORE_BASE64` — base64-encoded bytes of the keystore.
   - `TIVIHUB_UPLOAD_STORE_PASSWORD` — keystore password.
   - `TIVIHUB_UPLOAD_KEY_ALIAS` — the alias used when creating the keystore.
   - `TIVIHUB_UPLOAD_KEY_PASSWORD` — password for that alias.

   With GitHub CLI installed and authenticated, the binary keystore can be uploaded without printing its encoded contents:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\tivihub-release.p12")) |
     gh secret set TIVIHUB_RELEASE_KEYSTORE_BASE64
   ```

3. Push to `main` to get a signed APK artifact, or create and push a new version tag to publish a GitHub Release. The workflow fails with an explicit error if signing secrets are missing or incomplete; it does not produce an unsigned release APK.

Protect `v*` tags in the repository's rulesets and limit tag creation to trusted maintainers. Use the release signing key only for official project releases. Do not share its private material with contributors or store it in workflow artifacts.

## Playlists and provider data

1. Open **Settings** in TiviHub and add a playlist.
2. Choose M3U/M3U8 or Xtream and enter the URL and any required account details.
3. Select the playlist as active and browse the sections supported by that source.

M3U/M3U8 sources are used for live channels. Xtream sources can additionally provide movies, series, episodes, account information, and XMLTV guide data. TiviHub reads available metadata from the provider; it does not generate missing provider data.

HTTPS is recommended. HTTP playlist URLs are unencrypted and can expose credentials, requests, and media to parties able to observe or modify the connection. TiviHub warns before saving an HTTP playlist.

## Privacy and security

- Playlist data, catalog caches, favorites, library items, playback progress, and guide data are kept in app-private local storage.
- Playlist passwords and the optional OpenSubtitles API key are encrypted using Android Keystore-backed AES-GCM encryption.
- The app sends requests to the servers configured by the user. OpenSubtitles search sends the search text and API key to that third-party service.
- HTTP connections are not encrypted in transit. Use HTTPS sources whenever available.
- No IPTV content or provider credentials are included in this repository. Do not add real playlists, credentials, API keys, signing material, private URLs, or personal data to issues, pull requests, tests, screenshots, or commits.

## Project layout

```text
app/                         Android application module
  src/main/java/com/tivihub/
    data/model/              Domain models
    data/network/            M3U, Xtream, XMLTV, and subtitle APIs/parsers
    data/local/              Room persistence, repository, credential encryption
    ui/                      Compose screens, theme, and media player
  src/test/                  Unit tests
gradle/wrapper/              Pinned Gradle wrapper
.github/workflows/android.yml CI, verification, and tagged release automation
```

The app uses Kotlin, Jetpack Compose and Material 3, MVVM with lifecycle-aware `StateFlow` and coroutines, Room, OkHttp, and AndroidX Media3.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Keep changes focused, add or update tests for changed behavior, and run the Android checks locally. Never include private provider data or secrets.

## Legal note

TiviHub is a player, not a content provider. Users are responsible for their playlists, services, and rights to access and use content. The project does not endorse or guarantee third-party playlists, streams, DRM licenses, or subtitles.

## License

TiviHub is distributed under the MIT License. See [LICENSE](./LICENSE).

Third-party libraries and assets may be subject to their own licenses and terms. The MIT license for this repository does not grant rights to third-party content or trademarks.
