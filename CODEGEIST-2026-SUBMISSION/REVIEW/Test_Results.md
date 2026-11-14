# Test results

Run on 12 November 2026.

## Automated

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npm test` | 53 passed, 0 failed, 3 files |
| Type check | `npm run typecheck` | Clean |
| Forge manifest and code lint | `npx forge lint` | No issues found |
| UI production build | `npm run build:ui` | Built; one classic script and one stylesheet |

What the 53 tests cover:

- **Scheduling engine (22):** plan validation, cycles, self and unknown dependencies, critical path, parallel branches, critical and non-critical delays, early finishes, operator estimates, blocked steps, deadline margins, rollback window states, downstream impact, determinism.
- **Service (25):** permissions per role, state rules, server timestamps, blockers, escalation, notes, go/no-go and point of no return, no-go halting, simulated clock rules, completion, two operators starting the same step, concurrent notes, stale clients, rebuild from the event log, audit trail integrity, plan deletion, Jira side effects and failures, name lookup never stored, demo script in chunks and after manual steps, demo reset, storage self-test (pass and deliberate failure).
- **Forge adapters (6):** KVS store create-if-absent, concurrent writers through the KVS adapter, Rovo actions (no plan, live state, impact, identity from context, validation, write path).

## On the installed app (production build)

| Check | Result |
|---|---|
| Storage self-test: racing writers, concurrent starts, concurrent notes, rebuild from log | 5 of 5 (run on the development build of the same storage code) |
| Full demo scenario driven through the UI, recorded | Passed; this is the footage in the video |
| Import, escalation, operator estimate (`tools/capture/verify_extra.mjs`) | 8 of 8 feature checks passed |
| Rovo agent read action | Passed; answer matched the board |
| Rovo agent write action with confirmation | Passed on the development build |
| Jira: issue creation, links, transitions, comments | Passed, confirmed through Jira REST and the issue view |

## Media

| Check | Result |
|---|---|
| Video duration | 3:57 (limit: under 5 minutes) |
| Video format | 1920 x 1080, 30 fps, H.264, AAC stereo 48 kHz |
| Narration pace | 109 words per minute while speaking (target 105 to 120) |
| Loudness | -16 LUFS integrated, true peak -1.5 dBFS, no clipping |
| Subtitles | 34 cues; timings generated from the same per-line audio as the narration, so they cannot drift |
| Frames reviewed | 12 frames across all scenes: correct scene order, captions readable, end card present |
| Screenshots | 7 files, 3200 x 1800, each inspected |

## Not executed

- Listening to the narration. Pace and levels were measured; how it sounds was not judged by ear.
- Watching the video in a player from start to finish; frames were sampled instead.
- Tests with more than one real Atlassian account.
- Installation on a second, never-used site.
- The no-go path on the installed app (automated tests only).
