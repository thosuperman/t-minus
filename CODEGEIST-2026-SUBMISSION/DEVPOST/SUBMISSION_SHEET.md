# Submission sheet

Everything to paste into the Devpost form, in the order the form usually asks for it. Text in code blocks is ready to copy. The Codegeist-specific questions could not be read without a Devpost login, so match section 8 to the form's actual labels.

Nothing here has been submitted.

## 1. Project name

```
T-Minus: go-live mission control for Jira
```

## 2. Elevator pitch (155 of 200 characters)

```
Run an ERP or finance cutover minute by minute in Jira: see what is late, which deadlines are at risk, and how long you still have to decide on a rollback.
```

## 3. Thumbnail

Upload `SCREENSHOTS/00_Thumbnail.png` (1500 x 1000, 3:2, PNG, under 1 MB). It is a title card over the real Mission Control screenshot.

## 4. Image gallery

Upload in this order and paste each caption. The screenshots are real captures of the installed app, 3200 x 1800 PNG, each under 1 MB.

| File | Use | Caption |
|---|---|---|
| `SCREENSHOTS/00_Thumbnail.png` | Thumbnail (3:2, 1500 x 1000). Not for the gallery. | - |
| `SCREENSHOTS/01_Mission_Control.png` | Gallery 1 | Mission control: projected finish, deadline margins and the rollback decision window, recalculated after every change |
| `SCREENSHOTS/02_Live_Runbook.png` | Gallery 2 | The live runbook: each step is a Jira issue with an owner, dependencies and recorded or projected times |
| `SCREENSHOTS/03_Critical_Delay.png` | Gallery 3 | A critical delay: the data migration overruns and every dependent step shows its projected slip |
| `SCREENSHOTS/04_Rollback_Clock.png` | Gallery 4 | The rollback decision clock: 27 minutes left, limited by the time a rollback needs before the window closes |
| `SCREENSHOTS/05_Go_NoGo.png` | Gallery 5 | Go/no-go checkpoint: an authorized approver records the decision with evidence; it lands in the audit trail |
| `SCREENSHOTS/06_Rovo_Agent.png` | Gallery 6 | The Situation Commander, a Rovo agent, answers from recorded plan state and labels projections |
| `SCREENSHOTS/07_Jira_Integration.png` | Gallery 7 | Jira stays the system of record: dependency links, status and the decision comment on the issue |

## 5. Video demo link

```
PASTE THE YOUTUBE URL HERE
```

Upload `VIDEO/Final_Demo_1080p.mp4` to YouTube as **Public** first. Suggested YouTube details:

- Title: `T-Minus: go-live mission control for Jira (Codegeist 2026)`
- Description: `T-Minus is a Forge app that runs an ERP or finance go-live as a live runbook inside Jira, with a Rovo agent for situation briefings. Recorded from the app installed in Jira. All data is synthetic. Narration is a synthetic voice. https://tminus.hayaix.tech`
- Captions: upload `VIDEO/Subtitles.srt` (English).
- Audience: not made for kids.

## 6. Built with

```
atlassian-forge, jira, rovo, typescript, react, node.js, vite, vitest
```

## 7. Try it out links

```
https://tminus.hayaix.tech
```

```
https://github.com/thosuperman/t-minus
```

## 8. Codegeist questions

**Category**

```
Apps for Specialized Industries
```

**Bonus prize**

```
Best Agents (Rovo / assignable agents)
```

**Installation link**

```
https://developer.atlassian.com/console/install/6285d46c-4ef6-4efb-8d0b-6146906c6ce1?signature=AYABeDD8GxPBqZ%2BE8ZZRjmhcXtQAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBxXFnmAqMkSCyl6leOTM7vgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDJqZCVzW%2FRJw46Tz%2FQIBEIA7KpCT9ZAQwFJsiwTrSbSKKgdRQWmd%2FjUuSXbGYWf2JKynvqBa%2F6pgANm%2BkirVwQ87I84ioBd6pe1JkcEAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHzrqE7iuvRTZcycSDL2vL%2BAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMYTwAiUE9gVwinAxTAgEQgDtCr1tNBFtw8PO6nP%2BYM4Mj2FAxgXzP2tuvr1UHfYqaQDskqtHZB8zGjxZpadCx1rcIhwf0ABZcFLYGhAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAV3faaMp3F5mck34LGGuVGMAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAxGhCxxWC6o0pXlPaYCARCAOy4FJhD2J%2FQANeRhmYUO4jYqEJlO75s%2FjAmcHkBWRSuvXa92N96t2FuQxly5jqyCs%2BF7NjAN8IvIR%2FhlAgAAAAAMAAAQAAAAAAAAAAAAAAAAAGfXCKv9%2FyzkeoniLimxGvP%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJgwtcTW9eS3sKOnSzGepvRmbzPBKUV3fMdYR%2F8WTiUmnT8Xpgmp9vPHrfVg%2FZvsGsuWAZdzt8gu5MvXt5iAN%2BP9Ck%3D&product=jira
```

**Why this category**

T-Minus is built for finance, ERP and HR system cutovers. The demo scenario and the product's concepts come from that work: closing an accounting period before migration, reconciling trial balance and subledgers before sign-off, a bank payment file with a submission cutoff, a business-open window, and a point of no return after interfaces are redirected.

**How the project meets the technology requirement**

T-Minus is a Forge app (a manifest with a Jira project page, Rovo modules and Forge functions) integrated with two Atlassian capabilities:

- **Jira:** runbook steps are Jira issues. The app reads issues and "Blocks" links, creates the demo issues, moves issues between statuses as steps start and complete, and adds comments for blockers and decisions.
- **Rovo:** a `rovo:agent` with three `action` modules reads the app's plan state and can record a note after user confirmation.

**Best Agents write-up**

T-Minus includes a Rovo agent, the **T-Minus Situation Commander** (`rovo:agent`), with three `action` modules.

- **What it is for.** During a cutover, leads and executives ask the same questions repeatedly: are we on schedule, what is blocked, how long until we must decide on a rollback, what is waiting for a decision. The agent answers them from the app's recorded state.
- **Grounded, not generated.** `get-situation` returns the output of the deterministic scheduling engine with three kinds of data labelled separately: recorded facts, calculated projections, and operator estimates. The prompt tells the agent to keep them apart, to call a projection a projection, and to say when a finish time is only the earliest possible.
- **Reusable actions.** `get-situation` and `get-step-impact` are read actions that other agents can call as tools.
- **A guarded write.** `add-operational-note` records a note in the audit trail. Rovo asks the user to confirm first, the acting user comes from the Forge context and never from the model's inputs, and the note goes through the same validation and permissions as the UI. The audit trail marks it "via rovo".
- **Limits on purpose.** The agent cannot start or complete steps, record decisions, or change the clock, and it is told never to recommend starting a rollback.

Verified on a real site: the agent is listed in Rovo, answered from live plan data, and recorded a note after the confirmation card.

**Testing instructions for judges**

## Requirements

- A Jira Cloud site where you are a site admin.
- Rovo enabled on the site, for the agent part only. The board works without it.

## Install

1. Open the installation link:
   https://tminus.hayaix.tech (button "Install T-Minus on Jira"), or the link in `INSTALL_LINK.txt` in the repository.
2. Choose "Get app", select your site, and install. The app asks for four permissions: view Jira issue data, create and manage issues, view user profiles, and app storage.

## Try it

1. In Jira, open any software or business project. A project with an "In Progress" status shows the status changes best.
2. Open the **T-Minus** tab of the project (it may be under "More" in the project tabs).
3. Choose **Create demo plan**. Leave "Also create one Jira issue per step" ticked. This creates 17 synthetic issues with dependency links in that project.
4. Choose **Start cutover**, then **Run scripted lead-up**. In under a minute the plan is two hours in, with the data migration running over plan.
5. Choose **Advance clock +30 min**. Two deadlines turn red and the rollback decision window shrinks.
6. Select the step **MIG-3** to see its downstream impact. Use the row buttons to complete steps.
7. When the reconciliation steps are complete, choose **Decide** on GATE-1, enter evidence, and record a decision.
8. **Rovo:** open Rovo chat, choose Browse agents, pick **T-Minus Situation Commander**, and ask "Are we still on schedule, and what decisions are needed right now?"

**Reset demo** replaces the plan and moves the same Jira issues back to their first status, so the scenario can be replayed.

**Storage self-test** on the app's first screen races concurrent writers against your installation's storage and reports the result.

## Notes

- All demo data is synthetic. The demo plan uses a simulated clock that only moves when you advance it; this is labelled in the app, and audit entries keep the real server time.
- To use your own runbook: create one issue per step, link them with "Blocks", set original estimates, and choose "Import from project".
- Support: support@thonguyen.net

## 9. About the project

Paste everything below this line into "About the project" (Markdown).

---

## Inspiration

I build integrations for ERP, HR and finance systems. The riskiest night of any such project is the cutover: dozens of timed steps across teams, a bank payment file with a hard cutoff, a business-open deadline, and a point after which you cannot go back.

That night is usually run from a spreadsheet and a conference call. The plan lives in Jira, but nobody can answer the two questions that matter at 2 a.m.: how late are we, and can we still roll back?

## What it does

T-Minus turns the Jira issues of a cutover project into a live runbook.

- **Live execution.** Each step is a Jira issue. Operators start, complete and block steps from the board. The linked issue changes status with them, and other open boards update within seconds.
- **A schedule that recalculates.** After every change, T-Minus recomputes the critical path, the projected finish, and the margin to each deadline, such as a bank payment file cutoff.
- **A rollback decision clock.** It shows how long the team still has to decide on a rollback, and why: the point of no return, or the time a rollback itself needs before the window closes.
- **Go/no-go checkpoints.** A named approver records go, conditional go or no-go with evidence. Steps behind the checkpoint stay locked until then. Passing the point of no return needs an explicit confirmation.
- **An audit trail.** Every action is recorded once, in order, with the server time and the person who did it.
- **A Rovo agent, the Situation Commander.** It briefs leads and executives from the recorded plan state, and says which numbers are projections.

T-Minus never starts a rollback or touches the systems being cut over. It coordinates people and decisions.

## How I built it

T-Minus is a Forge app with no external services.

- **Jira project page** (Custom UI, React) for the board.
- **Forge functions** for every command and query, running as the acting user for Jira calls.
- **Forge storage (KVS)** holding an append-only event log per plan. Each event is written with create-if-absent on its sequence number, so two operators cannot record conflicting actions; the loser re-validates against the new state.
- **A deterministic engine** in plain TypeScript: dependency validation and cycle detection, forward and backward pass for the critical path, slip propagation, deadline margins, and the rollback window. The same code runs on the server and in the browser.
- **Rovo agent** (`rovo:agent`) with three actions: two read actions that return the engine's output with facts, projections and operator estimates labelled separately, and one write action (record a note) that Rovo confirms with the user first.
- **Jira REST** for issues, "Blocks" links, transitions and comments.

The demo scenario is a synthetic finance ERP cutover of 17 linked steps with a bank payment file cutoff, two go/no-go checkpoints and a point of no return. A clearly labelled simulated clock lets a reviewer run it in minutes; audit entries always keep the real server time.

## Challenges I ran into

- **Concurrency without a database transaction.** Forge KVS has no multi-key transaction with conditions, so I built the log around one documented primitive, create-if-absent, and added an in-app self-test that races real writers against the installed storage.
- **Forge's sandbox.** The first deployed build showed a blank page because the UI bundle was loaded as a classic script. Browser confirm dialogs are also blocked inside the app frame, so destructive actions use an in-place second click.
- **The 25-second function limit.** The scripted demo lead-up issues about thirty commands with Jira calls. It now runs as short, time-boxed calls that the board chains together.
- **Personal data.** The first version stored display names next to account ids. I changed it to store account ids only and look names up from Jira when a view is built.
- **Honest projections.** When a step overruns, nobody knows when it will end. T-Minus states the earliest possible finish and labels it, and keeps operator estimates separate from recorded facts.

## Accomplishments that I'm proud of

- The whole scenario runs on a real Jira site: linked issues created, steps executed, a delay propagating through the schedule, a blocker reported from a second session, a go/no-go decision recorded, and the Rovo agent answering from live state.
- 53 automated tests cover the engine, permissions, concurrency, the audit trail and the agent's actions.
- The app uses only generally available Forge modules, has no egress, and stores no names or email addresses.

## What I learned

- A cutover tool earns trust by being exact about what it knows. Separating facts, projections and assumptions shaped the engine, the UI and the agent prompt.
- Treating Jira as the system of record for steps, and Forge storage as the system of record for execution, kept both simple.
- Forge's constraints are easier to design around early: time limits, the sandbox, and what counts as personal data.

## What's next for T-Minus

- Approver and commander management in the UI, and decisions that need more than one approver.
- A web trigger so automated steps (deploy scripts, data loads) can report their own completion.
- Rehearsal reports: compare a dress rehearsal with the plan and carry the measured durations forward.
- Multi-user testing with separate accounts and a real cutover rehearsal; so far it has been tested on a demo site with one account.

---

**Built with** (Devpost tags)

```
atlassian-forge, jira, rovo, typescript, react, node.js
```

**Try it out** (links)

- Homepage and installation link: https://tminus.hayaix.tech
- Source: https://github.com/thosuperman/t-minus
