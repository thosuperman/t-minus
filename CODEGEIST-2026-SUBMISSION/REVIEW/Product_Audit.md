# Product audit

Final review on 15 November 2026: an independent read-only code audit, an end-to-end run on the deployed app, real questions to the Rovo agent, and a review of the video and screenshots.

## State of the product

| | |
|---|---|
| **Fully implemented** | Runbook from Jira issues (demo or import), start / complete / block / escalate / notes, server-side validation and timestamps, event-sourced audit trail with conflict-free appends, deterministic schedule engine (critical path, slip, deadlines, rollback decision window), go/no-go checkpoints and point-of-no-return confirmation, Jira status and comment sync, polling sync between sessions, Rovo agent with two read actions and one confirmed write action, storage self-test |
| **Partly implemented** | Roles: the plan creator is commander and approver; there is no UI to name other approvers. A checkpoint takes one approver. Later edits to Jira issues are not pulled into an existing plan |
| **Simulated** | The demo plan's clock can be advanced (labelled "Simulated clock" in the app; audit entries keep real server time). The scripted lead-up issues real commands through the normal path. All data is synthetic |
| **Verified on Forge** | Everything in the first row, on the production build, on one site, with one account (see `Feature_Verification.md`) |
| **Not verified** | Separate real accounts, a second site, the no-go path on the site, listening to the narration |

## Findings and what was done

| # | Severity | Finding | Action |
|---|---|---|---|
| 1 | P1 | Reads (plan list, board, audit trail, agent actions) did not check Jira project permission. A user who could open T-Minus in one project could read a plan of a project they cannot browse | **Fixed.** `BROWSE_PROJECTS` checked as the acting user on every read and in all three agent actions. Tests added; deployed; agent verified working under the check |
| 2 | P1 | Clearing a blocker dropped the time lost while blocked, so the projected finish jumped earlier | **Fixed.** Blocked time is carried as a pause. Engine and service tests added |
| 3 | P1 | The agent had no data for "the next decision and its deadline", which the prompt asked it to report | **Fixed.** `upcomingDecisions` with projected time, what each waits for, and approvers. Verified: the agent now says GATE-1 is projected two minutes after the rollback deadline |
| 4 | P1 | `get-step-impact` returned epoch milliseconds, which the model had to convert | **Fixed.** Plan times ("T+5:32 (16:08 UTC)") and critical-path flag |
| 5 | P1 | The halt banner after a no-go embedded the deciding user's raw account id | **Fixed.** The banner says where the no-go was recorded; who decided stays in the audit trail, by name |
| 6 | P2 | Import accepted a rollback longer than the window, with an error message using internal field names | **Fixed.** Rejected with messages in user terms |
| 7 | P2 | On a plan left running for days, timeline axis labels overlapped into unreadable text | **Fixed.** At most about nine whole-hour labels |
| 8 | P2 | Burned-in captions in the video overlapped for 0.25 s where a sentence is split in two | **Fixed** and video rebuilt |
| 9 | P2 | The shared plan list can lose an entry if two users create plans in the same instant | Not fixed: rare, the plan itself survives, fix needs a storage layout change |
| 10 | P2 | Delete is offered to non-commanders and refused by the server | Not fixed: the server is the control; cosmetic |
| 11 | P2 | The board shows clock times; the agent leads with "T+" offsets | Not fixed: both are correct; the board shows T+ for the plan clock and step times in the detail panel |

No P0 issue was found.

## Review by perspective

- **Forge engineer.** Generally available modules only, no egress, minimal scopes, function time limit respected by chunking, storage designed around a documented create-if-absent primitive and self-tested on the installation. Sound.
- **Rovo specialist.** Actions return engine output with facts, projections and assumptions labelled; identity comes from context; the only write is confirmed by Rovo. On the site, three answers matched the board figure for figure. The agent declines to recommend a rollback by design.
- **Cutover manager.** The scenario (period close, GL migration, reconciliation, finance sign-off, interface activation as point of no return, bank file cutoff, business open) is how finance go-lives are run. The rollback decision window and "earliest possible finish" wording are the parts a real lead would value most. Gaps: multi-approver sign-off, rehearsal comparison.
- **Product designer.** Clear hierarchy: four situation tiles, a decision banner, the runbook timeline, a step panel and the audit trail. Value is visible within 30 seconds of the demo plan loading. First load in Jira takes 10 to 15 seconds.
- **Security engineer.** Server-side authorization on every command and now on every read; no names or emails stored; only failures logged; no credentials in the repository (checked).
- **QA.** 57 automated tests, an end-to-end smoke test and an agent check that run against the deployed app.

## Against the judging criteria

These are evidence notes, not predicted scores.

| Criterion | Evidence for | Weakness |
|---|---|---|
| Technological implementation | Event-sourced log with conflict-free appends and an on-site self-test; deterministic critical-path engine shared by server and browser; Jira sync both ways; permission checks on reads and writes; 57 tests plus live checks | Tested with one account on one site |
| Design | Complete flow from plan creation or import to sign-off; consistent states and wording; projections visibly labelled; demo controls clearly separated | Desktop-first; no onboarding tour beyond the home screen text |
| Potential impact | A specific, costly problem (finance go-live nights) and a specific audience; rollback decision window is the moment that matters | No real customer cutover yet |
| Innovation | Execution-time mission control rather than planning; a rollback "decision clock"; an agent that is grounded in a deterministic engine and refuses to make the go/no-go call | Critical path itself is a known technique |
| Presentation | 3:57 video of the real app with captions; the strongest sequence (overrun → deadlines missed → rollback window shrinking → grounded agent briefing → recorded decision) is shown end to end | Synthetic voice |
