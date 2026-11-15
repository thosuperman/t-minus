# Project overview

Paste into Devpost's "About the project" field (Markdown). Every claim below was checked against the deployed app; see `REVIEW/Feature_Verification.md`.

---

**T-Minus is mission control for the night a finance or ERP system goes live.** It runs the cutover runbook minute by minute inside Jira and, after every action, answers the two questions that decide the night: how late are we, and how long do we still have to decide on a rollback? A Rovo agent briefs leads and executives from the same recorded data.

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

**Who it is for.** Cutover leads, finance and ERP project teams, and the controllers and executives who must sign off a go-live: anyone who runs a timed, one-way change with a business deadline behind it.

**How it differs from planning tools.** Gantt charts and release checklists describe the plan before the night. T-Minus works during it: it records what actually happened, recalculates from real start and end times, and tracks the moment after which rolling back is no longer possible. Planning stays in Jira; execution and decisions happen in T-Minus.

## How I built it

T-Minus is a Forge app with no external services.

- **Jira project page** (Custom UI, React) for the board.
- **Forge functions** for every command and query, running as the acting user for Jira calls.
- **Forge storage (KVS)** holding an append-only event log per plan. Each event is written with create-if-absent on its sequence number, so two operators cannot record conflicting actions; the loser re-validates against the new state.
- **A deterministic engine** in plain TypeScript: dependency validation and cycle detection, forward and backward pass for the critical path, slip propagation, deadline margins, and the rollback window. The same code runs on the server and in the browser.
- **Rovo agent** (`rovo:agent`) with three actions: two read actions that return the engine's output with facts, projections and operator estimates labelled separately, and one write action (record a note) that Rovo confirms with the user first.
- **Jira REST** for issues, "Blocks" links, transitions and comments.
- **Jira permissions apply.** Plans of a project are shown only to people who can browse that project, in the board and through the agent; changes need edit permission, a step assignment or a named role.

The demo scenario is a synthetic finance ERP cutover of 17 linked steps with a bank payment file cutoff, two go/no-go checkpoints and a point of no return. A clearly labelled simulated clock lets a reviewer run it in minutes; audit entries always keep the real server time.

## Challenges I ran into

- **Concurrency without a database transaction.** Forge KVS has no multi-key transaction with conditions, so I built the log around one documented primitive, create-if-absent, and added an in-app self-test that races real writers against the installed storage.
- **Forge's sandbox.** The first deployed build showed a blank page because the UI bundle was loaded as a classic script. Browser confirm dialogs are also blocked inside the app frame, so destructive actions use an in-place second click.
- **The 25-second function limit.** The scripted demo lead-up issues about thirty commands with Jira calls. It now runs as short, time-boxed calls that the board chains together.
- **Personal data.** The first version stored display names next to account ids. I changed it to store account ids only and look names up from Jira when a view is built.
- **Honest projections.** When a step overruns, nobody knows when it will end. T-Minus states the earliest possible finish and labels it, and keeps operator estimates separate from recorded facts.

## Accomplishments that I'm proud of

- The whole scenario runs on a real Jira site: linked issues created, steps executed, a delay propagating through the schedule, a blocker reported from a second session, a go/no-go decision recorded, and the Rovo agent answering from live state.
- 57 automated tests cover the engine, permissions, concurrency, the audit trail and the agent's actions, plus end-to-end checks that drive the deployed app and ask the agent real questions.
- The agent's answers match the board: on the demo site it reported the same slip, deadline misses and rollback window as the app, and pointed out that the next go/no-go checkpoint is projected after the rollback decision deadline.
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
atlassian-forge, jira, rovo, typescript, react, node.js, vite, vitest
```

**Try it out** (links)

- Homepage and installation link: https://tminus.hayaix.tech
- Source: https://github.com/thosuperman/t-minus
