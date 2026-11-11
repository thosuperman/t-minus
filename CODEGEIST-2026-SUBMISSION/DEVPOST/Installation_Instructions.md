# Installation and testing instructions

For judges and reviewers. Time needed: about five minutes.

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
