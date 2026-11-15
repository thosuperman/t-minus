# Submission fields

What to enter on the Devpost submission form. The standard Devpost fields are listed first. The Codegeist-specific questions could not be read without your Devpost login, so that part lists what the official rules require and where each answer is; match them to the actual field labels when you open the form.

## Standard Devpost fields

| Field | Value |
|---|---|
| Project name | T-Minus: go-live mission control for Jira |
| Elevator pitch | See `Project_Title_and_Tagline.md` (155 characters) |
| About the project | `Project_Overview.md`, from "Inspiration" to "What's next" |
| Built with | atlassian-forge, jira, rovo, typescript, react, node.js, vite, vitest |
| Try it out links | https://tminus.hayaix.tech and https://github.com/thosuperman/t-minus |
| Video demo link | https://youtu.be/Nxrbcvqr1PQ |
| Image gallery | The seven files in `SCREENSHOTS/`, in order. Captions are in `SCREENSHOTS/README.md` |
| Thumbnail | `SCREENSHOTS/00_Thumbnail.png` |

## Required by the official rules

| Requirement (rules section 4) | Answer |
|---|---|
| Category | **Apps for Specialized Industries** |
| Bonus prize(s) entered | **Best Agents - Rovo/Assignable agents** |
| Installation link for judges | The link in `INSTALL_LINK.txt` (also behind the Install button on https://tminus.hayaix.tech) |
| Instructions to get the app working | `Installation_Instructions.md` |
| Text description of features and functionality | `Project_Overview.md`, "What it does" |
| How the project meets the technology requirement | `Technologies.md`, first section |
| Bonus prize write-up | Below |
| Language | English throughout |

### Why this is a Specialized Industries entry

T-Minus is built for finance, ERP and HR system cutovers. The demo scenario and the product's concepts come from that work: closing an accounting period before migration, reconciling trial balance and subledgers before sign-off, a bank payment file with a submission cutoff, a business-open window, and a point of no return after interfaces are redirected.

### Best Agents write-up

T-Minus includes a Rovo agent, the **T-Minus Situation Commander** (`rovo:agent`), with three `action` modules.

- **What it is for.** During a cutover, leads and executives ask the same questions repeatedly: are we on schedule, what is blocked, how long until we must decide on a rollback, what is waiting for a decision. The agent answers them from the app's recorded state.
- **Grounded, not generated.** `get-situation` returns the output of the deterministic scheduling engine with three kinds of data labelled separately: recorded facts, calculated projections, and operator estimates. The prompt tells the agent to keep them apart, to call a projection a projection, and to say when a finish time is only the earliest possible.
- **Reusable actions.** `get-situation` and `get-step-impact` are read actions that other agents can call as tools.
- **A guarded write.** `add-operational-note` records a note in the audit trail. Rovo asks the user to confirm first, the acting user comes from the Forge context and never from the model's inputs, and the note goes through the same validation and permissions as the UI. The audit trail marks it "via rovo".
- **Respects Jira permissions.** The read actions run the same project permission check as the board, as the person asking, so the agent never shows a plan of a project that person cannot browse.
- **Limits on purpose.** The agent cannot start or complete steps, record decisions, or change the clock, and it is told never to recommend starting a rollback.

Verified on a real site: the agent is listed in Rovo, answered from live plan data, and recorded a note after the confirmation card. On 15 November it answered three questions (status and decisions, downstream impact of a delay, an executive update for the CFO) with the same figures as the board, and pointed out that the next go/no-go checkpoint is projected two minutes after the rollback decision deadline. See `REVIEW/Feature_Verification.md`.

## Declarations to be ready for

These come from the official rules; the form may ask you to confirm them.

- You are at least the age of majority where you live and not resident in an excluded country or territory.
- The project is your original work and solely yours.
- The project was newly created during the submission period (27 October to 22 December 2026).
- Third-party components are used under their licences (all npm packages; see `REVIEW/Security_and_Privacy.md`).
- The video contains no third-party trademarks or copyrighted music. It shows Jira and Rovo, which are the sponsor's own products, and has no music.

## Things only you can do

1. Paste the video link (https://youtu.be/Nxrbcvqr1PQ) into the form.
2. Open the Devpost form and match the fields above to its labels.
3. Decide whether to mention AI coding assistance in the description. The rules do not ask for it.
4. Submit before **22 December 2026, 12:00 pm Pacific Time**.
