# Contributing to TiviHub

Thanks for considering a contribution. Changes should improve the Android app while preserving user privacy, safe credential handling, and compatibility with supported playlist formats.

## Before opening a pull request

1. Open the repository root in Android Studio, or use the Gradle wrapper.
2. Make a focused change and add or update tests for behavior that changes.
3. Run the checks used by continuous integration:

   ```powershell
   .\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
   ```

4. Describe the user-visible change, implementation, and verification in the pull request.

## Code expectations

- Follow the Kotlin, Compose, MVVM, persistence, and networking patterns already in the project.
- Keep parsers, URL construction, and other data transformations testable.
- Report failures instead of silently returning success-shaped empty data.
- Never log or commit playlist URLs containing credentials, provider details, API keys, passwords, signing keys, personal information, or private screenshots.
- Do not add bundled playlists or copyrighted media.
- Keep dependencies and their licenses aligned with the project's Android and JDK requirements.

## Releases

Only project maintainers should create `vX.Y.Z` release tags. The GitHub Actions workflow signs release APKs using the repository's private signing key; never request or expose that key in a pull request, issue, commit, or workflow artifact.
