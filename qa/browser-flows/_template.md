---
id: flow-id
title: "Short flow title"
group: assistant # Organize by feature area (e.g., assistant, api, rules, email, integrations)
priority: high # high = run every QA pass, low = run only when explicitly included
resources:
  - assistant-settings
---

## Goal

Describe the user-visible behavior being verified.

## Preconditions

- List any prerequisites (logins, connected accounts, feature flags).

## Steps

1. Step one.
2. Step two.
3. Step three.

## Expected results

- Outcome one.
- Outcome two.

## Failure indicators

- Example: save error toast appears.
- Example: value does not persist after refresh.

## Cleanup

- Revert or remove anything created during the test.
