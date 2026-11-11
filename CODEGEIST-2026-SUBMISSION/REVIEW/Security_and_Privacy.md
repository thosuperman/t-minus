# Security and privacy

## Data

| Question | Answer |
|---|---|
| Where is data stored? | Forge storage (KVS) of the installation, on Atlassian infrastructure |
| What is stored? | Plans (step titles, durations, dependencies, issue keys), the execution event log, text typed by users, and Atlassian account ids |
| Names or email addresses? | Not stored. Names are looked up from Jira when a view is built (tested: a storage scan for display names) |
| External services? | None. No egress is declared in the manifest |
| AI | The app makes no LLM calls. Rovo, operated by Atlassian, calls the app's three actions |
| Logs | The app logs only failures to Forge logs. An entry can include an error message and up to 300 characters of a Jira reply. Stated in the privacy policy |

## Access control

- The acting user always comes from the Forge context, never from request payloads or model inputs.
- Jira calls from the UI run as the acting user, so Jira permissions apply.
- Roles: commander (creates the plan; starts it, passes the point of no return, resets a demo), approver (records go/no-go), operator (edit permission on the project, or step owner), viewer.
- Every command is validated on the server against the current state. The UI hiding a button is not the control.
- The Rovo write action goes through the same validation and is confirmed by the user in Rovo first.

## Integrity

- Events are append-only. Each is written with create-if-absent on its sequence number; a conflicting writer loses and re-validates.
- Timestamps are taken on the server. Simulated demo time is stored separately and flagged on each event.
- An in-app self-test races concurrent writers against the installation's storage.

## Safety limits

- The app never acts on the systems being cut over. A no-go halts the plan in the app only.
- Projections are labelled, and the earliest-possible-finish case is called out, so a number is not mistaken for a promise.

## Dependencies

Runtime: `@forge/api`, `@forge/resolver`, `@forge/kvs`, `@forge/bridge`, `react`, `react-dom`. Development: TypeScript, Vite, Vitest, Forge CLI, Playwright (capture tooling only). All from npm under their own licences.

## Not done

- No third-party security review or penetration test.
- No rate limiting beyond Forge's own.
- Multi-account permission behaviour is covered by automated tests, not by a test with several real accounts.
