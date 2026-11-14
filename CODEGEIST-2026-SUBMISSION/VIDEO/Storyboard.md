# Storyboard

Final video: **3:57**, 1920 x 1080, 30 fps. Every scene is footage of the production build of T-Minus inside Jira on a demo site, driven by real clicks. The only additions are a pointer dot (a headless browser has no visible cursor), captions, and the end card.

| Time | Scene | On screen | Edit |
|---|---|---|---|
| 0:00–0:22 | The problem | Jira list view of the cutover project: 17 linked issues, the runbook as plain Jira work. | Played at 0.846x |
| 0:22–0:45 | Introducing T-Minus | The T-Minus tab in the Jira project. The plan opens in its ready state; the pointer visits the projected finish and rollback tiles; the runbook scrolls. | Played at 1.387x |
| 0:45–1:04 | Live runbook execution | Start cutover. Start FRZ-1 with the row button. Advance the simulated clock 15 minutes. Complete FRZ-1. Audit trail entries appear. | Played at 1.211x |
| 1:04–1:13 | Fast-forward (simulated clock) | "Run scripted lead-up": real commands through the normal validation path. The waiting time is shortened in the edit. | Played at 1.185x; wait shortened from 17.3s to 3.5s |
| 1:13–1:50 | Critical delay and recalculation | MIG-3 is over plan. Selecting it lists the downstream impact. The clock advances 30 minutes; two deadlines turn red; the runbook shows the new projection. | Played at 1.014x |
| 1:50–2:22 | Rollback decision window and a second session | The rollback decision tile in its warning state. A second browser session (not shown) records a blocker; the header gains "Step blocked" and the audit trail shows the entry. | Played at 0.956x |
| 2:22–3:05 | Rovo Situation Commander | Rovo chat: Browse agents, T-Minus Situation Commander, the question typed and sent. The real answer appears; the chat scrolls through it. The thinking time is shortened in the edit. | Played at 1.4x; wait shortened from 11.0s to 3.0s |
| 3:05–3:26 | Go/no-go decision | REC-2 completes; "Decision needed" appears. The approver opens GATE-1, types the evidence, and records a conditional go. The audit entry appears. | Played at 1.4x |
| 3:26–3:34 | The Jira issue | The Jira issue behind GATE-1: blocked-by links, status Done, the decision comment. | Played at 1.4x |
| 3:34–3:52 | Closing | The board after the decision. | Played at 0.8x |
| 3:52–3:57 | End card | Product name, homepage, and three disclosure lines | Still image |

## Disclosures shown on the end card

- All data shown is synthetic. The plan clock is simulated and labelled in the app.
- Recorded from the app installed in Jira. Two waiting periods are shortened. Narration is a synthetic voice.
- T-Minus is an independent app built on Atlassian Forge.

## What the numbers in the narration refer to

- "About forty-five minutes over plan": the board showed "Over by 45 min" on MIG-3 when the scripted lead-up finished.
- "Ninety-four minutes of slip" and "twenty-six minutes left": the Rovo agent's answer in this take, matching the board (+1 h 34 min, 26 min left).

## Reproducing the footage

`tools/capture/login.mjs` (sign in once), then `tools/capture/capture.mjs` (resets the demo and records every scene), then `python3 tools/video/build.py`.

