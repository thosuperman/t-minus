# Narration script

English, 388 words. Spoken at 116 words per minute; 98 words per minute across the whole video including pauses.

Voice: the macOS system voice "Samantha", slowed to 82% with pitch preserved. This is a synthetic voice, and the end card says so. To replace it with your own recording, record each line below as a separate file and see `tools/video/build.py`.


## 0:00 – The problem

- A finance system go-live is a long night of tightly ordered steps.
- Data is migrated and reconciled, a bank payment file has a hard cutoff, and at some point there is no way back.
- Most teams run it from a spreadsheet and a conference call.

## 0:22 – Introducing T-Minus

- This is T-Minus, a Forge app that runs inside Jira.
- It is not another planning tool. It is mission control for executing the go-live.
- Each step of the runbook is a Jira issue, with an owner, dependencies, and a planned duration.

## 0:45 – Live runbook execution

- The lead starts the cutover, and operators start and complete their steps from the board.
- Every action is checked on the server, time-stamped, and written to an audit trail.
- The linked Jira issue moves with it.

## 1:03 – Fast-forward (simulated clock)

- For this demo, a clearly labelled simulated clock fast-forwards the first two hours.

## 1:12 – Critical delay and recalculation

- Now the data migration runs long. It is about forty-five minutes over plan.
- T-Minus recalculates the schedule after every change, and lists every step that is pushed back.
- Thirty minutes later, the bank payment file cutoff is projected to be missed.
- This is plain arithmetic on recorded times and planned durations. The app labels it as the earliest possible finish, not a forecast.

## 1:49 – Rollback decision window and a second session

- The rollback decision window shows how long the team still has to decide to go back.
- It is limited by the point of no return, and by the time a rollback needs before business opens.
- T-Minus supports that decision. It never starts a rollback.
- In a second browser session, an operator reports a blocker. This board picks it up within seconds.

## 2:21 – Rovo Situation Commander

- The Situation Commander is a Rovo agent.
- We ask: are we still on schedule, and what decisions are needed right now?
- It answers from the recorded plan state: what is late, what is blocked, and how long the rollback window is.
- Here it reports ninety-four minutes of slip, the blocked migration with its reason, and twenty-six minutes left to decide on a rollback.
- These are the same numbers the board shows.

## 3:04 – Go/no-go decision

- When reconciliation is complete, the go or no-go checkpoint opens.
- An authorized approver records the decision, with the evidence.
- It is written to the audit trail, and to the Jira issue.

## 3:26 – The Jira issue

- The Jira issue carries the same decision.

## 3:34 – Closing

- From scattered tasks and uncertain timelines, to coordinated, evidence-based go-live execution.
- T-Minus. Built on Atlassian Forge, for Jira and Rovo.

## Pronunciation notes

The voice is given "T minus", "Jeera" and "Roe-voe" so that it says T-Minus, Jira and Rovo correctly. Captions show the real spellings.
