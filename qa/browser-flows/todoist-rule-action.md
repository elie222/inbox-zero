---
id: todoist-rule-action
title: "Add Todoist task rule action (via MCP emulator)"
group: integrations
priority: low # requires local Todoist MCP emulator + seeded connection
resources:
  - conversation-rules
  - todoist-connection
---

## Goal

A user with Todoist connected can add an "Add Todoist task" action to a rule:
the action appears in the action-type dropdown, its fields (Task, Description,
Project, Due date) render with sensible defaults, the Project dropdown is
populated from Todoist, and the rule saves successfully. The integrations page
shows Todoist as a connectable integration.

## Preconditions

- `NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED=true` and
  `NEXT_PUBLIC_INTEGRATIONS_ENABLED=true` in `apps/web/.env`.
- Local Todoist MCP emulator running:
  `npx tsx scripts/todoist-mcp-emulator.ts 4310` and
  `MCP_SERVER_URL_OVERRIDES={"todoist":"http://localhost:4310/mcp"}` in
  `apps/web/.env`.
- An active Todoist `McpConnection` seeded for the test account with the
  `add-tasks` tool (`isWrite: true`). Any `accessToken` value works; the
  emulator ignores auth.
- Logged-in browser session for the test account.

## Steps

1. Navigate to `<base-url>/<account-id>/integrations`. Screenshot the table.
2. Verify the Todoist row exists and shows Connected.
3. Navigate to the assistant rules page and open any existing rule (or create
   one) to reach the rule editor dialog.
4. In the Then section, select Add Action, open the action-type dropdown, and
   screenshot it.
5. Select "Add Todoist task". Screenshot the rendered fields.
6. Verify the Task field defaults to an AI template in double braces and the
   Project dropdown lists projects fetched from Todoist (emulator returns
   Inbox, Work, Personal).
7. Choose project "Work" and due date "Tomorrow". Save the rule.
8. Reopen the rule and verify the action persisted with the chosen values.

## Expected results

- Todoist appears on the integrations page as Connected.
- "Add Todoist task" appears in the action dropdown (after Call webhook).
- Task/Description default to `{{...}}` AI templates; Project dropdown shows
  emulator projects; Due date select shows the five options.
- Rule saves without errors and the action persists on reopen.

## Failure indicators

- "Add Todoist task" missing from the dropdown (feature flag not picked up).
- Project dropdown stuck loading or empty (emulator/override not wired).
- Save fails with a Todoist-not-connected error despite the seeded connection.

## Cleanup

- Remove the "Add Todoist task" action from the rule and save (keep the rule
  itself if it pre-existed).
