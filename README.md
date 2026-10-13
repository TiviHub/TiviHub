<div align="center">

# TiviHub

**Your playlists. Your library. One Android IPTV player.**

Browse and play live TV, movies, and series from playlists and provider accounts you configure.

[![Android CI](https://github.com/TiViHub/TiviHub/actions/workflows/android.yml/badge.svg?branch=main)](https://github.com/TiViHub/TiviHub/actions/workflows/android.yml)
[![Latest release](https://img.shields.io/github/v/release/TiViHub/TiviHub?display_name=tag&sort=semver)](https://github.com/TiViHub/TiviHub/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Android 8.0+](https://img.shields.io/badge/Android-8.0%2B-3DDC84?logo=android&logoColor=white)](https://developer.android.com/about/versions/oreo)

</div>

> [!IMPORTANT]
> **TiviHub does not provide or host channels, movies, series, playlists, or streams.** You must supply sources that you are authorized to access and use. You are responsible for complying with applicable laws and your providers' terms.

TiviHub is a native Android player for organizing and watching content from your own M3U/M3U8 playlists and Xtream-compatible services. It brings live TV, movies, series, programme information, playback progress, favorites, and a personal library together in a content-first interface.

## Features

- **Live TV** — browse channels and groups, view channel details, and mark favorites.
- **Movies and series** — explore provider catalogs by category, search titles, view available metadata, and save favorites.
- **Playlist support** — add M3U/M3U8 playlists for live channels or Xtream-compatible accounts for live TV, movies, series, episodes, and provider metadata.
- **TV guide** — view cached XMLTV programme information when supplied by the active source.
- **Playback** — play compatible streams with AndroidX Media3, including HLS, DASH, and supported Widevine DRM sources.
- **Continue watching** — save movie and episode progress locally and resume playback.
- **Subtitles** — use embedded subtitles or search/download subtitles with your own OpenSubtitles API key.
- **Library and favorites** — keep saved live channels, movies, and series together, with saved-item counts.
- **Flexible catalog layout** — choose an automatic or fixed grid-column count for movies and series.
- **Local data** — cache catalogs and guide data, with controls to refresh them.
- **Material 3** — use system, light, or dark themes.
- **Playback orientation** — browse in portrait and use the device's orientation during playback.

Available features and metadata depend on your playlist provider, content, device, and network.

## Download and install

Download the latest versioned APK from [GitHub Releases](https://github.com/TiViHub/TiviHub/releases). Each release includes a SHA-256 checksum and the APK signing certificate's SHA-256 fingerprint.

1. Download the APK to your Android device.
2. Open it from your browser or file manager and allow installation from that source if Android asks.
3. Add a playlist or provider account in TiviHub's settings.

Android may warn because the APK is installed outside Google Play. Install only releases from this repository. To update an existing installation, the new APK must be signed with the same release key; uninstalling the app first may remove its local data.

### Verify the APK checksum

The checksum helps detect accidental or in-transit changes. In PowerShell, run this from the folder containing the downloaded APK and checksum file:

```powershell
$apk = ".\TiviHub-vX.Y.Z.apk"
$checksumFile = ".\TiviHub-vX.Y.Z-SHA256SUMS.txt"
$expected = (Get-Content $checksumFile).Split(' ')[0]
$actual = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "APK checksum mismatch" }
Write-Output "APK checksum matches"
```

A checksum alone does not prove who published an APK. Each release also publishes the signing certificate's SHA-256 fingerprint. Verify the APK with Android SDK Build Tools' `apksigner verify --print-certs <apk>` and compare the result to the fingerprint file. Trust that fingerprint only after independently confirming the expected value.

## Build from source

### Requirements

- Android 8.0 (API 26) or later to run the app.
- JDK 17.
- Android SDK Platform 36 and Build Tools 36.0.0.
- A playlist or provider account that you are authorized to use.

Open the repository root in Android Studio, or use the Gradle wrapper from a terminal. The first build downloads the Gradle distribution, Android Gradle Plugin, and dependencies.

**Windows PowerShell**

```powershell
.\gradlew.bat :app:assembleDebug
```

**macOS / Linux**

```bash
./gradlew :app:assembleDebug
```

The debug APK is created at `app/build/outputs/apk/debug/app-debug.apk` (on Windows, `app\build\outputs\apk\debug\app-debug.apk`). To install it on a connected device or emulator:

```powershell
.\gradlew.bat :app:installDebug
```

### Tests and lint

Run the same checks as the CI workflow:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

On macOS or Linux, replace `.\gradlew.bat` with `./gradlew`.

## Releases

GitHub Actions runs unit tests, lint, and a debug build on pushes to `main` and pull requests. A push to `main` also builds a signed release APK; its APK, checksum, and certificate fingerprint are available in the run's **Artifacts** section for 14 days.

To publish a versioned release, maintainers create and push a semantic version tag:

```powershell
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

The tag becomes the Android version name. GitHub Actions assigns an increasing Android version code, verifies the signed APK, generates its checksum and certificate fingerprint, then publishes the files to [GitHub Releases](https://github.com/TiViHub/TiviHub/releases) with generated release notes. Treat published version tags as immutable.

### Release signing setup (maintainers)

Release signing is configured through GitHub Actions secrets in an environment named `release`. Never commit a keystore, password, or encoded keystore to this repository. Keep an offline backup of the keystore and credentials; losing them prevents compatible APK updates.

1. Create a dedicated keystore on a trusted machine, outside the repository:

   ```powershell
   keytool -genkeypair -v `
     -keystore "$HOME\tivihub-release.p12" `
     -alias tivihub-release `
     -keyalg RSA -keysize 2048 -validity 10000 `
     -dname "CN=TiviHub, O=TiviHub Project"
   ```

   The certificate subject is visible in APK signature metadata and is not identity-verified by Android. Use a project identity rather than personal contact details.

2. In the repository's **Settings → Environments**, create the `release` environment and add these **environment secrets**:
   - `TIVIHUB_RELEASE_KEYSTORE_BASE64` — Base64-encoded keystore bytes.
   - `TIVIHUB_UPLOAD_STORE_PASSWORD` — keystore password.
   - `TIVIHUB_UPLOAD_KEY_ALIAS` — the key alias.
   - `TIVIHUB_UPLOAD_KEY_PASSWORD` — password for the key alias.

   Restrict deployments to `main` and `v*` tags. Require approval from a trusted reviewer where available. GitHub plan limitations may affect which environment protection rules are available.

   With GitHub CLI installed and authenticated, encode and upload the keystore without printing its contents:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\tivihub-release.p12")) |
     gh secret set TIVIHUB_RELEASE_KEYSTORE_BASE64 --env release --repo TiViHub/TiviHub
   ```

3. Protect `main` and `v*` tags using the repository's available rules. Require pull requests and passing checks for `main`, review of workflow/build changes, and restrict tag creation to trusted maintainers. Keep signing secrets scoped to the `release` environment.

The release workflow stops with an explicit error if a signing secret is missing. It does not publish an unsigned release APK.

## Privacy and security

- Playlists, catalog caches, favorites, library items, playback progress, and guide data are stored in app-private local storage.
- Playlist passwords and the optional OpenSubtitles API key are encrypted using Android Keystore-backed AES-GCM encryption.
- Other saved data, including playlist server URLs, is not encrypted by the app. Android app-data backup is disabled.
- TiviHub sends requests to servers configured by the user. OpenSubtitles searches send the search text and API key to that third-party service.
- For playlist compatibility, Android cleartext traffic is enabled. HTTP connections are not encrypted in transit; the playlist editor warns and requires confirmation before saving an HTTP playlist. Use HTTPS sources whenever available.
- No IPTV content or provider credentials are included in this repository. Do not share real playlist URLs, credentials, API keys, signing material, private URLs, or personal data in issues, pull requests, tests, screenshots, or commits.

For vulnerability reporting, see [SECURITY.md](SECURITY.md). Please report security issues privately rather than in public issues.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request. Keep changes focused, add or update tests for changed behavior, and run the checks listed above.

## Project and license

TiviHub is built with Kotlin, Jetpack Compose and Material 3, AndroidX Media3, Room, OkHttp, and Kotlin Coroutines.

This project is distributed under the [MIT License](LICENSE). Third-party libraries and assets may have their own licenses and terms. The project license does not grant rights to third-party content or trademarks.

## Legal note

TiviHub is a media player, not a content provider. Users are responsible for their playlists, services, and rights to access and use content. The project does not endorse or guarantee third-party playlists, streams, DRM licenses, or subtitles.
