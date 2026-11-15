# Feature verification

What was checked, where, and how. "Site" means the production build installed from the public link on `one-atlas-egic.atlassian.net`, driven through the real UI. "Tests" means the automated suite (57 tests, in-memory store and fake Jira). Dates: 11, 12 and 15 November 2026. On 15 November the production build was rechecked with `tools/capture/smoke.mjs` (8 of 8) and `tools/capture/rovo_check.mjs` (three real questions to the agent).

## A. Live go-live mission control

| Feature | Site | Tests | Notes |
|---|---|---|---|
| Runbook from Jira issues (demo scenario, 17 linked issues) | Yes | Yes | Issues and 20 "Blocks" links confirmed through Jira REST |
| Import an existing Jira project as a runbook | Yes | Partly | 17 steps, two checkpoints and the point of no return recognised from labels; dependencies from links |
| Start and complete steps | Yes | Yes | Jira issue moved Backlog → In Progress → Done |
| Mark blocked with a reason; clear blocker | Yes | Yes | Reason added as a Jira comment |
| Escalation | Yes | Yes | Flag on the step and audit entry |
| Operational notes | Yes | Yes | From the board and through the Rovo agent |
| Server-side timestamps and actor | Yes | Yes | Audit entries show server time; simulated plan time is flagged |
| Execution history (audit trail) | Yes | Yes | Gapless sequence; tamper attempt on an existing entry is refused in tests |
| Clearing a blocker keeps the blocked time in the projection | Not shown on the site | Yes (added 15 November) |
| Status synchronised across sessions | Yes, two browser sessions of one account | Yes | Second session's blocker appeared on the first board within one polling cycle |
| Several operators at once | Storage self-test on the site | Yes | Three concurrent starts: exactly one succeeds. Not tested with separate real accounts |

## B. Deterministic scheduling

| Feature | Site | Tests |
|---|---|---|
| Critical path | Yes (shown and updated) | Yes, including a hand-calculated baseline |
| Dependency propagation of a delay | Yes (45-minute overrun moved every dependent step) | Yes |
| Parallel tasks | Yes (two reconciliation steps ran together) | Yes |
| Slip and projected finish | Yes | Yes |
| Non-critical delay absorbed by float | Not shown on the site | Yes |
| Invalid dependencies (cycles, unknown or self references) | Not triggered on the site | Yes |
| Deadline margins (window end, bank file cutoff) | Yes | Yes |

## C. Rollback decision management

| Feature | Site | Tests |
|---|---|---|
| Rollback duration and window set per plan | Yes (import form) | Yes |
| Remaining decision time, with the reason for the limit | Yes | Yes |
| Warning, critical and closed states | Warning and closed seen | All four |
| Go/no-go checkpoint: conditional go with evidence | Yes | Yes |
| No-go halts the plan and starts no rollback | Not exercised on the site | Yes |
| Authorization (approver, commander) | Single account only | Yes |
| Point of no return needs a confirmation note | Yes (earlier run on the development build) | Yes |
| Decision in the audit trail and on the Jira issue | Yes | Yes |

## D. Rovo Situation Commander

| Feature | Site | Notes |
|---|---|---|
| Agent listed in Rovo | Yes | "T-Minus Situation Commander" under Browse agents |
| Answers from app state | Yes | Reported 94 minutes of slip, the blocked step with its reason, 26 minutes of rollback window; the board showed the same |
| Explains what limits the rollback window | Yes | Uses the engine's own explanation |
| Identifies pending decisions | Yes | "No checkpoint is currently awaiting a decision", which was true at that moment |
| Labels projections | Yes | "earliest possible time, assuming the blocker is resolved immediately" |
| Executive update | Yes (15 November) | Five sentences: slip, both projected deadline misses, rollback window and deadline, next decision with its projected time |
| Downstream impact of a step | Yes (15 November) | Named the reconciliation steps, GATE-1 and PNR-1 for MIG-3, with the same 77-minute slip as the board |
| Next decision and its projected time | Yes (15 November) | "Finance sign-off ... projected at T+5:32", two minutes after the rollback decision deadline at T+5:30 |
| Hides plans of projects the user cannot browse | Tests only | The agent ran under the real user's permission check on the site, so the allowed path is verified there; the refused path is covered by tests |
| Write action with confirmation | Yes (development build) | Rovo showed a "Please review" card; the note appeared marked "via rovo" |

An earlier answer called the plan "Halted" when a step was only blocked, and misattributed the rollback limit. The agent now receives the phase meaning and the limiting factor from the engine, and the prompt forbids inferring them. The answer recorded in the video is from after that fix.

## E. Specialized-industry scenario

The demo plan contains: freeze and period close, backup as rollback baseline, master data and GL migration, interface deployment and bank sandbox test, trial balance and subledger reconciliation, a finance go/no-go, interface activation as the point of no return, first payment run, bank payment file with a cutoff, business validation, final sign-off and handover. All names and figures are invented.

## Known gaps

- No UI yet to add approvers or commanders; the plan creator holds both roles.
- A checkpoint needs one approver, not several.
- Later edits to Jira issues are not picked up by an existing plan.
- No web trigger for automated steps.
