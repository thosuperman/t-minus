# Remaining risks

| Risk | Why it matters | What can be done |
|---|---|---|
| Narration is a built-in male synthetic voice ("Daniel"), slowed by time-stretching | It may sound flat or slightly artificial, and its pronunciation of "Jira" and "Rovo" was tuned for another voice. Pace and loudness were measured, but it was not listened to | Listen once. If you prefer, record your own voice from `VIDEO/Narration_Script.md`; `tools/video/build.py` rebuilds the video from per-line audio |
| Installed on only one site | A judge's site may differ (project types, workflows, Rovo availability) | Install on a second site if you can get one. The board needs only Jira |
| Tested with one account | Read-only users, non-approvers and operators without edit permission are covered by automated tests only | Invite a second account to the demo site and try the board |
| Devpost form fields not inspected | The Devpost account in the browser used for checking was not signed in or registered, so the form could not be opened | Sign in, join the hackathon, open the form and compare with `DEVPOST/SUBMISSION_SHEET.md` |
| Video shows an older agent answer | The Rovo answer in the video was recorded on 12 November; the prompt has since improved | None needed: the answer in the video is a real response and still accurate for that moment |
| Demo site expires 9 February 2027 | Judging ends 3 February 2027, so this covers it, but only just | Nothing needed unless judging is extended |
| First load takes several seconds | The board appeared after roughly 10 to 15 seconds on first open in Jira | Mention it in the instructions if it worries you; later loads are faster |
| Workflows without an "In Progress" status | Starting a step cannot move the Jira issue, and the app shows a warning | The instructions recommend a project with an In Progress status |
| Category fit | Judges may see a cutover tool as general IT. The sponsor can move an entry to another category | The description and demo are built around finance and ERP work |
| Name | "T-Minus" was checked with one Marketplace search and one web search, not a trademark search | Do a proper check before any commercial use |
| No real cutover yet | Everything was tested with synthetic data on a demo site | Stated plainly on the homepage and in the description |
