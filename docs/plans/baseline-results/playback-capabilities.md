# Playback capabilities (T13b)

Read from `src/components/PlaybackDialog.tsx` at commit of this branch. "Present" means the code and UI exist; none of this was exercised against a live stream.

| Capability | Status | Evidence |
|---|---|---|
| Audio track selection | Present | `audioLanguages` state (line 164); a select labelled "Audio track" renders when more than one language exists (lines 953 to 958); handler `selectAudioLanguage` |
| Quality selection | Present | `qualityHeights` (line 166); select "Auto quality" plus one entry per height, shown when more than one height exists (lines 965 to 975); `selectQuality` at line 609 |
| Playback speed | Present, not for live | Select "Playback speed" with 0.5 to 2 in 7 steps (lines 981 to 996); sets `video.playbackRate` (line 990) |
| Subtitles (text tracks) | Present | `TextTrackOption` (line 23), `selectTextTrack` and `addTextTrackAsync` in the Shaka wrapper (lines 55 to 57) |
| Fullscreen | Present | Fullscreen icon button (line 877) plus the native control |
| Volume, mute, seek bar | Present through native controls | `<video autoPlay controls playsInline>` (lines 885 to 891) |
| Keyboard shortcuts of our own | Only Escape (close) and a Tab focus trap | The `keydown` handler (lines 249 to 278) handles `Escape` and `Tab` only |
| Picture-in-Picture | No custom button; the native controls may offer it | The `<video>` has no `disablePictureInPicture`; whether WebView2's menu shows PiP needs a manual check |
| Sleep timer | Absent | No match in the file |
| Next-episode prompt or autoplay | Absent | No match for "next episode" anywhere in `src/` |
| Casting | Present | `invoke("cast_media")` and `invoke("stop_cast")` (lines 749 and 797) |

## Corrections to `docs/plans/app-improvements.md`

The improvement plan said playback speed was a single reference and audio-track support was unchecked. Both were wrong: speed, audio-track and quality selection already exist. Items D2 (speed) and D5 (audio and quality) are removed from the playback-features module. What remains there: keyboard shortcuts, a sleep timer, next-episode prompt and autoplay, channel zapping, clearer error messages, and a check of whether Picture-in-Picture works from the native controls.
