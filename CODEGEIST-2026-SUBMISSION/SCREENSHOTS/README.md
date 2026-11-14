# Screenshots

Seven screenshots of T-Minus running inside Jira on a demo site (production build, installed from the public link). Each is 3200 x 1800 pixels (PNG), captured by a browser driven with real clicks. Nothing is composited or edited, except `00_Thumbnail.png`, which is a title card built from screenshot 01. All data is synthetic; the plan clock is simulated and labelled in the app.

| File | Shows | Suggested caption |
|---|---|---|
| `00_Thumbnail.png` | Title card over the Mission Control screenshot, 1500 x 1000 (3:2). Built by `tools/thumbnail/make.py` | Devpost thumbnail; not for the gallery |
| `01_Mission_Control.png` | Board header, the four situation tiles, timeline with critical path, step panel | Mission control: projected finish, deadline margins and the rollback decision window, recalculated after every change |
| `02_Live_Runbook.png` | Runbook rows by workstream with states, owners and times | The live runbook: each step is a Jira issue with an owner, dependencies and recorded or projected times |
| `03_Critical_Delay.png` | Data migration running 45 minutes over plan, with its downstream impact | A critical delay: the data migration overruns and every dependent step shows its projected slip |
| `04_Rollback_Clock.png` | Rollback decision window in its warning state, two deadlines projected to be missed | The rollback decision clock: 27 minutes left, limited by the time a rollback needs before the window closes |
| `05_Go_NoGo.png` | GATE-1 recorded as a conditional go, with evidence, and the audit trail entry | Go/no-go checkpoint: an authorized approver records the decision with evidence; it lands in the audit trail |
| `06_Rovo_Agent.png` | The Rovo agent answering "Are we still on schedule, and what decisions are needed right now?" | The Situation Commander answers from recorded plan state and labels projections |
| `07_Jira_Integration.png` | The Jira issue behind GATE-1: linked steps, status Done, the decision comment | Jira stays the system of record: dependency links, status and the decision comment on the issue |

Notes

- The assignee shown, "Tho Nguyen", is the project author's own account on the demo site. No other personal data, credentials or tokens appear.
- The same shot list can be re-captured with `tools/capture/capture.mjs` (see the repository README).
