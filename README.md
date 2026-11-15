# T-Minus — go-live mission control for Jira

T-Minus runs an ERP, HR or finance cutover minute by minute inside Jira. Each runbook step is a Jira issue. Operators start and complete steps, the app recalculates the schedule after every change, and the board shows what is late, what that delays downstream, and how long the team still has to decide on a rollback.

The name has been checked with one Marketplace search and one web search, not a trademark search.

## Status

Deployed to the Forge **production** environment and installed from the public sharing link on a Forge demo site (Jira). Last checked there on 15 Nov 2026.

| Area | State |
|---|---|
| Scheduling engine, event log, permissions, Rovo action logic | 57 automated tests pass locally |
| Deployed app end to end | `tools/capture/smoke.mjs` (8 of 8) and `tools/capture/rovo_check.mjs` (three real questions to the agent, answers matched the board), 15 Nov 2026 |
| Board UI | Exercised in a local browser harness with two users; renders and works inside Jira on the demo site |
| Forge storage concurrency | Verified on the site with the in-app self-test (5 of 5 checks) |
| Jira integration | Issue creation, links, transitions and comments verified on the site |
| Live execution | Start, complete, block, go/no-go, point of no return and two-session polling verified on the site |
| Rovo agent | Read and write actions verified on the site |
| Project access | Plans of a Jira project are shown only to people who can browse that project, on the board and through the agent |
| Personal data | Only account ids are stored. Display names are looked up from Jira when a view is built and are never written to storage (covered by a test; verified visually on the site) |
| Production deploy | Done (11 Nov 2026); version 2.6.0 on 15 Nov 2026 |
| Sharing link | Created 11 Nov 2026: "Sharing with anyone", Jira. Saved in `INSTALL_LINK.txt` and on the homepage |
| Install from the sharing link | Done on the demo site (12 Nov 2026): development build removed, production build installed from the public link and exercised end to end. Not tested on a second, never-used site |
| Submission package | `CODEGEIST-2026-SUBMISSION/`: Devpost text, seven screenshots, the demo video script and subtitles, and review documents. The video file itself is kept out of Git |
| Homepage, privacy, terms | Live at https://tminus.hayaix.tech (`/privacy`, `/terms`); source in `site/` |

## Architecture

```
 Jira project page (Custom UI, React)            Rovo chat
 ui/src  ── polls every 4 s ──┐                  T-Minus Situation Commander
                              │ invoke('api')        │ actions
                              ▼                      ▼
                    src/index.ts  (Forge resolver + action handlers)
                              │
                    src/core/api.ts      one dispatch table
                    src/core/service.ts  commands, queries, Jira side effects
                    src/core/events.ts   validation + event fold (pure)
                    src/core/engine.ts   critical path, slip, rollback window (pure)
                       │                         │
          src/forge/kvsStore.ts          src/forge/jira.ts
          Forge KVS                      Jira REST v3 as the acting user
          plan, snapshot, head,          issues, links, transitions, comments,
          one key per event              permission check
```

Design choices:

- **Event log with create-if-absent.** Every change is one immutable event stored under `evt:<plan>:<seq>` with `keyPolicy: 'FAIL_IF_EXISTS'`. Two writers cannot take the same sequence number; the loser reloads, re-validates and either retries or gets a clear rejection. The log is also the audit trail.
- **Server time only.** Timestamps are taken in the resolver. The browser clock is used for display between reads.
- **Polling baseline.** Clients ask for the latest sequence number every 4 seconds and fetch the full view only when it changed. Forge Realtime and Jira events are not used.
- **Deterministic engine.** The same pure functions run on the server and in the browser. Recorded facts, projections and operator assumptions are labelled separately in the UI and in the agent's data.
- **No automatic production actions.** A no-go halts execution. The app never starts a rollback.
- **No stored personal data.** Events, step owners and decisions hold Atlassian account ids only. Names come from Jira's bulk user lookup at read time, as the acting user in the board and with the app's own read access in the Rovo agent.
- **Simulated clock for demos.** Simulation plans carry a clock offset that a commander can advance. Events keep the real server time (`at`) next to the plan time (`planTime`) and a `simulated` flag.

## Forge modules and APIs

| Piece | Used for | Phase |
|---|---|---|
| `jira:projectPage` (Custom UI, `layout: blank`) | The board | GA |
| `rovo:agent`, `action` ×3 | Situation Commander | GA |
| `@forge/resolver`, `@forge/bridge` `invoke` | UI calls | GA |
| `@forge/kvs` | Storage, `FAIL_IF_EXISTS` for concurrency | GA |
| `@forge/api` `asUser().requestJira` | Jira REST v3: `myself`, `mypermissions`, `search/jql`, `issue/bulk`, `issueLink`, `transitions`, `comment` | GA |

Scopes: `storage:app`, `read:jira-work`, `write:jira-work`, `read:jira-user`. No external egress. No Preview or EAP feature is used.

## Run locally

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

The dev server at http://localhost:5199 is a development harness: the same service code, an in-memory store and a fake Jira. Add `?user=omar` (operator) or `?user=vera` (read-only) to act as another user. It is not the Forge app.

## Deploy to a Forge development site

These steps need your Atlassian account. Credentials are read from `../.env` (`FORGE_EMAIL`, `FORGE_API_TOKEN`); load them with `set -a; . ../.env; set +a` before running Forge commands.

1. Create an API token (Atlassian account → Security → API tokens, scoped to Forge) and log in:

```bash
npx forge login
```

2. Register the app. This replaces the placeholder `app.id` in `manifest.yml`:

```bash
npx forge register "T-Minus"
```

3. Build the UI, deploy and install on a site with Jira (and Rovo for the agent):

```bash
npm run build:ui
```

```bash
npx forge deploy
```

```bash
npx forge install
```

4. Open any Jira project → Apps → T-Minus.

## On-site results (development environment, demo site, 11 Nov 2026)

Run on `one-atlas-egic.atlassian.net` in two Jira projects: `CUT` (workflow To Do → Done) and `GOLIVE` (Backlog → In Progress → Done).

| Check | Result |
|---|---|
| Board loads in a Jira project and reads storage | Pass |
| Demo plan creates 17 Jira issues with 20 "Blocks" links in the right direction | Pass (confirmed through Jira REST) |
| `kvs.set` with `FAIL_IF_EXISTS`: one of two racing writers wins; later write refused | Pass (self-test) |
| Three concurrent starts of one step: exactly one succeeds | Pass (self-test) |
| Five concurrent notes: all recorded, gapless sequence | Pass (self-test) |
| State rebuilt from the event log equals the snapshot | Pass (self-test) |
| Scripted lead-up in time-boxed calls | Pass; intermediate progress visible while it ran |
| Starting a step moves the Jira issue to In Progress; completing moves it to Done | Pass in `GOLIVE` (Backlog → In Progress → Done). In `CUT` there is no In Progress status, and the app reports a warning |
| Start and complete by hand (row buttons) | Pass (REC-1, REC-2) |
| Mark blocked with a reason, clear blocker | Pass; the reason is added as a Jira comment |
| Second browser session picks up changes through polling | Pass ("Step blocked" changed to "Slipping" after the first session acted) |
| Go/no-go: conditional go with evidence | Pass; decision in the audit trail, Jira comment added, issue moved to Done |
| Point of no return: confirmation note required, rollback window closes | Pass |
| Critical path and slip recalculated after each change | Pass (slip fell from 51 to 46 to 6 min as reconciliation steps completed) |
| Rovo agent listed and answering from `get-situation` | Pass; it reported slip, the overrunning step, deadline margins and the rollback window, and labelled the simulated clock and the "earliest possible" finish |
| Rovo agent write action | Pass; Rovo showed a "Please review" card, and after confirmation the note appeared in the audit trail marked "via rovo" |

Not yet checked on the site:

- No-go (halting the plan), escalation, and the operator estimate through the board.
- Import from an existing Jira project.
- A second user account: read-only users, users without edit permission, non-approvers.
- Names in the Rovo agent's answers after the switch to read-time lookup (uses the app's own access; not re-run on the site).
- Polling cost over a long session.
- Production environment, sharing link, install on a clean site.

Known display issues seen on the site:

- First load of the board inside Jira took about 15 seconds.
- Fixed since: the plan list now shows the current project's plans, the duplicate text box is gone, and Delete/Reset use an in-place confirmation because Forge frames block `window.confirm`.

Two packaging facts learned from the first deploy:

- Forge ran the Vite module build as a classic script, so the UI is built as one IIFE bundle with a plain `<script>` tag and a separate stylesheet file.
- `tsconfig.json` must not set `noEmit`, or the Forge bundler produces no output.

## Known limitations

- One point of no return per plan.
- Durations are whole minutes; there are no calendars or resource limits.
- The plan definition is a snapshot taken at import. Later edits to the Jira issues are not picked up.
- Gate approval needs one authorized approver, not a quorum.
- The plan list holds the 50 most recent plans.
- Approver and commander lists start with the plan creator; there is no UI yet to add people.
- No web trigger for automated steps, no `rovo:mcp` exposure and no issue panel yet.

## Homepage hosting

Static pages in `site/`, served from a private S3 bucket through CloudFront (AWS profile `hayaitech`):

| Piece | Value |
|---|---|
| Bucket | `tminus-site-<account id>`, public access blocked, read only by CloudFront |
| CloudFront | `E8FSTI9YKF2EZ`, HTTPS only, certificate from ACM (us-east-1) |
| DNS (`hayaix.tech` zone) | A/AAAA alias for `tminus`, the certificate validation CNAME, and a CAA record on `tminus.hayaix.tech` allowing `amazon.com` (the rest of the domain stays Let's Encrypt only) |

To publish a change, upload the file and clear the cache. `privacy.html` and `terms.html` are uploaded without the extension:

```bash
aws s3 cp site/privacy.html s3://<bucket>/privacy --content-type "text/html; charset=utf-8" --profile hayaitech
```

```bash
aws cloudfront create-invalidation --distribution-id E8FSTI9YKF2EZ --paths "/*" --profile hayaitech
```

The board screenshot on the homepage comes from the local harness: run `npm run dev`, then open `http://localhost:5199/?demo=overrun&shot=1`.

## Demo capture and video tooling

The screenshots and the demo video are recorded from the installed app, not from the local harness.

| Step | Command | What it does |
|---|---|---|
| Sign in once | `node tools/capture/login.mjs` | Opens Chrome on the Atlassian login page and waits for a person to sign in. The session is kept in `tools/capture/.profile` (ignored by Git) |
| Record | `node tools/capture/capture.mjs` | Resets the demo plan, then drives the real app in Jira with real clicks, saving screencast frames per scene and 3200 x 1800 screenshots |
| Extra checks | `node tools/capture/verify_extra.mjs` | Verifies import, escalation and the operator estimate on the installed app |
| Build the video | `python3 tools/video/build.py` | Generates narration with the macOS `say` voice, renders captions, and assembles `Final_Demo_1080p.mp4` and `Subtitles.srt` with ffmpeg |

Requirements: Google Chrome, `npm install` inside `tools/capture`, ffmpeg, Python 3 with Pillow, macOS for the `say` voice. The site and app ids in `tools/capture/lib.mjs` are those of the author's demo site.
