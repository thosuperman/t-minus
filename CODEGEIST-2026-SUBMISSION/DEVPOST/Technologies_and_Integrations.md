# Technologies and integrations

## How the project meets the technology requirement

T-Minus is a Forge app (a manifest with a Jira project page, Rovo modules and Forge functions) integrated with two Atlassian capabilities:

- **Jira:** runbook steps are Jira issues. The app reads issues and "Blocks" links, creates the demo issues, moves issues between statuses as steps start and complete, and adds comments for blockers and decisions.
- **Rovo:** a `rovo:agent` with three `action` modules reads the app's plan state and can record a note after user confirmation.

## Forge modules

| Module | Key | Purpose |
|---|---|---|
| `jira:projectPage` | `tminus-board` | The board, Custom UI, inside a Jira project |
| `rovo:agent` | `tminus-situation-commander` | Situation briefings |
| `action` | `get-situation` | Read: plan state, schedule, deadlines, rollback window, pending decisions |
| `action` | `get-step-impact` | Read: steps that depend on a given step and their projected delay |
| `action` | `add-operational-note` | Write: record a note in the audit trail (Rovo confirms first) |
| `function` | resolver and three action handlers | Backend |

## Forge services and APIs

| Piece | Use |
|---|---|
| `@forge/kvs` | Plans, event log, snapshots. `keyPolicy: 'FAIL_IF_EXISTS'` gives conflict-free appends |
| `@forge/resolver`, `@forge/bridge` | UI to backend calls |
| `@forge/api` (`requestJira`) | Jira REST v3 as the acting user; display-name lookup as the app for the agent |

## Jira REST endpoints

Used: `mypermissions`, `search/jql`, `issue/bulk`, `issueLink`, `issue/{key}/transitions`, `issue/{key}/comment`, `issue/createmeta/{project}/issuetypes`, `user/bulk`.

## Scopes

`storage:app`, `read:jira-work`, `write:jira-work`, `read:jira-user`

## What it does not use

- No external services and no egress.
- No Preview or EAP Forge features.
- No LLM calls from the app. The only AI is Atlassian's Rovo, which calls the app's actions.

## Other technology

TypeScript, React 19, Vite (UI bundle), Vitest (53 tests). The homepage is static HTML on Amazon S3 and CloudFront.
