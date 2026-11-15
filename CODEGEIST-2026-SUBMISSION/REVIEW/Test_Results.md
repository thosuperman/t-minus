# Test results

Last run on 15 November 2026. Earlier runs on 11 and 12 November are summarised at the end.

## Automated

| Check | Command | Result |
|---|---|---|
| Unit and integration tests | `npm test` | 57 passed, 0 failed, 3 files |
| Type check | `npm run typecheck` | Clean |
| Forge manifest and code lint | `npx forge lint` | No issues found |
| UI production build | `npm run build:ui` | Built; one classic script and one stylesheet |
| Deploy | `forge deploy -e production` | Deployed, version 2.6.0 |

What the 57 tests cover:

- **Scheduling engine (23):** plan validation, cycles, self and unknown dependencies, critical path, parallel branches, critical and non-critical delays, early finishes, operator estimates, blocked steps, time lost while blocked, deadline margins, rollback window states, downstream impact, determinism.
- **Service (28):** permissions per role, hiding plans from people who cannot browse the Jira project, state rules, server timestamps, blockers and unblocking, escalation, notes, go/no-go and point of no return, no-go halting, simulated clock rules, completion, two operators starting the same step, concurrent notes, stale clients, rebuild from the event log, audit trail integrity, plan deletion, Jira side effects and failures, name lookup never stored, demo script in chunks, demo reset, the agent's situation report including upcoming decisions, storage self-test.
- **Forge adapters and Rovo actions (6):** KVS create-if-absent, concurrent writers through the KVS adapter, Rovo actions (no plan, no identity, live state, impact, access refused, identity from context, validation, write path).

## On the installed app (production build, 15 November 2026)

`node tools/capture/smoke.mjs FINERP` drives the real board on `one-atlas-egic.atlassian.net`:

| Check | Result |
|---|---|
| Signed in to the demo site | Pass |
| Storage self-test (racing writers, concurrent starts and notes, rebuild from log) | Pass, all checks |
| Demo plan reset (17 steps, Jira issues moved back) | Pass |
| Scripted lead-up: plan two hours in, a step running | Pass |
| After +30 min: projected finish moves later | Pass (01:31 → 02:47, +1 h 16 min) |
| A deadline is projected to be missed | Pass (business open missed by 11 min, bank cutoff by 16 min) |
| Rollback window shrinks | Pass (205 → 44 min) |
| Critical path marked | Pass |

`node tools/capture/rovo_check.mjs FINERP` then asked the deployed agent three questions in Rovo chat. Answers are saved verbatim in `tools/capture/out/rovo/answers.json` (not in Git). Compared with the board at the same moment:

| Figure | Board | Agent |
|---|---|---|
| Slip against baseline | +1 h 17 min | 77 minutes |
| Business open | missed by 12 min | "12 minutes past the planned business opening" |
| Bank payment file cutoff | missed by 17 min | "a 17-minute breach" |
| Rollback window | 43 min left | 43 min (42 in the later answer, a minute later) |
| Overrunning step | MIG-3, 1 over plan | MIG-3, 76 minutes over plan, "earliest possible finish" |
| Next decision | GATE-1 waits for REC-1 and REC-2 | GATE-1 projected at T+5:32, after the rollback deadline at T+5:30 |

## Media

| Check | Result |
|---|---|
| Video duration | 3:57 (limit: under 5 minutes) |
| Video format | 1920 x 1080, 30 fps, H.264, AAC stereo 48 kHz, 33 MB |
| Narration | Male synthetic voice (macOS "Daniel"), 109 words per minute while speaking |
| Loudness | -16.1 LUFS integrated, true peak -1.5 dBTP, no clipping |
| Subtitles | 34 cues, no overlaps, timed from the same per-line audio as the narration |
| Email redaction | 0 readable email addresses in 156 frames of the opening scene (on-device text recognition) |
| Frames reviewed | Contact sheet of one frame every 10 seconds: scene order, captions and end card correct |
| Screenshots | 7 files, 3200 x 1800, no email address found by text recognition |

See `VIDEO/Video_QA.md` for the video checks in detail.

## Not executed

- Listening to the narration. Pace, levels and silences were measured; how it sounds was not judged by ear.
- Tests with more than one real Atlassian account.
- Installation on a second, never-used site.
- The no-go path on the installed app (automated tests only).

## Earlier runs (11 and 12 November)

- Full demo scenario driven through the UI and recorded: this is the footage in the video.
- `tools/capture/verify_extra.mjs`: import, escalation, operator estimate, plan deletion, 8 of 8.
- Rovo write action with confirmation: passed on the development build.
- Jira issue creation, links, transitions and comments confirmed through Jira REST and the issue view.
