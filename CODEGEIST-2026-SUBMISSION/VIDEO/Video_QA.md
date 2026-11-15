# Video QA

File: `Final_Demo_1080p.mp4` (built 15 November 2026 by `tools/video/build.py`).

| Check | Requirement | Result | How it was checked |
|---|---|---|---|
| Duration | Under 5 minutes; target 3 to 4 | 3:57 | ffprobe |
| Resolution and frame rate | 1920 x 1080 | 1920 x 1080, 30 fps, H.264 | ffprobe |
| Audio | Clear, consistent volume, no music | AAC stereo 48 kHz, -16.1 LUFS, true peak -1.5 dBTP, no music | ffmpeg loudnorm |
| Voice | Clear male synthetic voice, 105 to 115 wpm | macOS "Daniel" (British English), 109 wpm while speaking, pitch kept | Word count / measured speech time |
| Pauses | Natural | 0.45 s between sentences; scene-end silences of 4 to 6 s in the last minute while the screen shows the result | silencedetect |
| Subtitles | Accurate and in sync | 34 cues, no overlaps; text is the narration script, timing from the same audio | Script parse of `Subtitles.srt` |
| Burned-in captions | Readable, never stacked | Two lines maximum; a caption's hold no longer overlaps the next one (fixed 15 November) | Build code and frame check |
| Footage | Real app, no fabricated states | Recorded from the production build installed in Jira, driven by real clicks; the Rovo answer is a real response | Capture script `tools/capture/capture.mjs` |
| Edits | Disclosed | Two waiting periods shortened; playback speed 0.8x to 1.4x per scene; account email blurred in the first scene. All stated on the end card or in `Storyboard.md` | Build log `timeline.json` |
| Private data | None visible | 0 readable email addresses in 156 frames of the opening scene; the only name shown is the author's own | On-device text recognition |
| Branding | Product name consistent | "T-Minus" on the board tab, captions and end card | Contact sheet |
| Trademarks and music | None beyond the sponsor's own products | Shows Jira and Rovo only; no music | Review |

## Not checked

- **Listening.** The audio was measured but not heard. Play it once before uploading.
- **The Rovo answer in the video** was recorded on 12 November with the earlier prompt. The agent's current answers (15 November) are equally grounded and add the next decision's projected time; the video's answer is still a true record of the app at the time.

## YouTube upload

- Visibility: **Public** (required by the rules).
- Title and description: `DEVPOST/Video_Description.md`.
- Captions: upload `Subtitles.srt` as English.
- Not made for kids. No music, so no Content ID claims are expected.
