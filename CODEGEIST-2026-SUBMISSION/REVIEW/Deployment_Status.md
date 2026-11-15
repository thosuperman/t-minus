# Deployment status

## Current state (15 November 2026)

| Item | State |
|---|---|
| Forge app | "T-Minus", registered in the author's Developer Space |
| Production environment | Version 2.6.0 deployed on 15 November 2026 (no new scopes, so the installation updated without re-consent); marked by Forge as eligible for "Runs on Atlassian" |
| Development environment | Deployed earlier; no longer installed anywhere |
| Distribution | "Sharing with anyone", product: Jira |
| Installation link | In `INSTALL_LINK.txt`; also behind the Install button on https://tminus.hayaix.tech |
| Installed on | `one-atlas-egic.atlassian.net` (Forge demo site, expires 9 February 2027), production build, status up to date |
| Scopes | `storage:app`, `read:jira-work`, `write:jira-work`, `read:jira-user` |
| Vendor details on the install page | Tho Nguyen; support@thonguyen.net; privacy and terms pages on tminus.hayaix.tech; "stores personal data: No" |

## How the installation was tested

1. The development build was uninstalled from the demo site.
2. The public link was opened from the homepage button, as a reviewer would.
3. "Get app", site selected, "Install". The install page showed the app name, vendor and four permissions.
4. `forge install list` then showed one installation: production, Jira, up to date.
5. The app was opened in three Jira projects on that site and exercised (see `Feature_Verification.md`).

## What was not tested

- Installation on a second site that has never had the app. Only one suitable site was available.
- A user other than the installing admin (operators without edit permission, non-approvers). Covered by automated tests only.
- Rovo on a site where it is not enabled. The board does not depend on it.

## No account-specific assumptions

The app reads the project key from the Jira context, the acting user from the Forge context, and stores data per installation. The demo plan makes the person who creates it the commander and approver. Nothing in the code refers to a specific site, project or account.

## Redeploy

```bash
npm run build:ui
```

```bash
npx forge deploy -e production
```

Minor versions roll out to existing installations automatically. A change to scopes needs `forge install --upgrade` on each site.
