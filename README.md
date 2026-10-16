# TiviHub

<p align="center">
  <img src="./public/icons/tivihub-192.png" width="88" alt="TiviHub logo">
</p>

<p align="center">
  <strong>A local-first media library and browser player.</strong><br>
  An installable static PWA for the sources you choose.
</p>

<p align="center">
  <a href="https://player.tivihub.nl">Open TiviHub Player</a>
  &nbsp;·&nbsp; No TiviHub account
  &nbsp;·&nbsp; No application server
</p>

TiviHub organizes and plays compatible media from user-configured M3U and Xtream sources. The app runs in the browser and stores its library on the device. The production site consists of static files and can be hosted on ordinary HTTPS web hosting.

## Highlights

- **Your sources, your browser:** Import an M3U file or connect to a remote M3U URL or Xtream-compatible provider. M3U groups labeled Movies/VOD and Series/TV Shows are organized as on-demand media; series episodes use common `S01E02` or `1x02` naming.
- **One media library:** Browse live channels, recent TV guide data, movies, series, and episodes.
- **Development-only demo:** The bundled sample M3U is available when running the local development server and is omitted from production builds.
- **Playback and progress:** Use browser-native media playback or Shaka Player for supported HLS and DASH streams; keep favorites, watchlists, and playback progress locally.
- **Built for different screens:** Responsive phone and desktop layouts, light and dark themes, and PWA installation where supported.
- **Portable local data:** Export and restore an encrypted backup protected by a password you choose.

Playback and guide availability depend on provider authorization, CORS, network access, stream formats, device codecs, and browser DRM support.

## Privacy and data

TiviHub has no TiviHub account service, application API, analytics, or cloud sync. Playlists, catalogs, guide data, favorites, library entries, playback progress, and settings are stored in the browser's local storage. Source credentials, source URLs, and the optional OpenSubtitles API key are encrypted in IndexedDB with a key held by that browser. Derived stream URLs can contain provider tokens and are also stored locally.

When media is played or subtitles are searched, the browser contacts the configured provider and OpenSubtitles directly. Those services receive the request details and the user's network address. Providers must allow browser CORS requests; HTTPS pages also commonly cannot access insecure HTTP sources. TiviHub does not proxy or relay those requests. Static hosting providers may retain ordinary website access logs.

Browser storage is limited to that browser and device. Clearing site data, changing browsers, or losing the device can remove local data. Export a backup if you need to move or preserve it. Local storage does not protect data from malicious same-origin code, compromised browser extensions, or access to an unlocked device.

## Browser and playback support

TiviHub is designed for current Safari, Chrome, and Microsoft Edge on phones, tablets, and desktop computers. Browser capabilities vary by operating system and device. HTTPS is required for modern media and cryptographic APIs; `localhost` is suitable for development.

The player does not supply DRM licenses or bypass access controls. Protected playback requires authorization and compatible license services from the configured provider. License requests go directly from the browser to that provider.

| Browser family | DRM considerations |
| --- | --- |
| Chrome and Edge | Widevine may be available when supported and enabled by the browser and device. |
| Safari | Protected playback typically uses FairPlay. Providers may require custom certificate or license handling that cannot be inferred generically. |
| Chrome on iOS | Uses WebKit and has media limitations similar to Safari; it cannot play Widevine-only streams. |

Test the specific provider and stream on the target device. The presence of playback controls does not guarantee that a stream is compatible or authorized.

## Develop locally

Install Node.js 20 or later, then run from the repository root:

```sh
npm ci
npm run dev
```

Run checks and produce the static production build:

```sh
npm run typecheck
npm test
npm run build
```

The build is written to `dist/`. Node.js is used only for local development and building; it is not needed on the deployed host. The repository intentionally has no CI/CD build or deployment pipeline.

## Deploy to static hosting

1. Run `npm ci` and `npm run build` locally.
2. Upload the **contents** of `dist/` to the document root for `player.tivihub.nl`.
3. Enable HTTPS and serve `sw.js` from the site root so the PWA can register its service worker.
4. Configure application-navigation requests to fall back to `index.html`, and serve JavaScript, CSS, and `manifest.webmanifest` with appropriate MIME types.

The service worker caches the application shell and static build assets. Provider responses, media streams, subtitle results, and playback are not cached; offline use is limited to the app shell and previously cached static assets.

## Content and rights

TiviHub is a browser-based player and catalog organizer for sources users configure. It does not supply, sell, license, or host channels or media, and it does not verify that a provider or source is authorized.

Users are responsible for using sources and content they are authorized to access and for complying with copyright rules, provider terms, territorial restrictions, and applicable laws. TiviHub does not provide DRM licenses or bypass DRM, authentication, subscriptions, geographic controls, or other technical protection measures. Third-party media, programme data, artwork, names, and trademarks remain the property of their respective owners.

## License

TiviHub is distributed under the [MIT License](./LICENSE). The license applies to TiviHub software only; it does not grant rights to third-party content or brands.
