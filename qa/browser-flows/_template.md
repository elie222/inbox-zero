---
id: flow-id
title: "Short flow title"
description: "What this flow validates in 1-2 sentences."
category: settings
estimated_duration: 60s
resources:
  - assistant-settings
requires:
  - authenticated_session
conflicts_with: []
parallel_safe: false
timeout_minutes: 20
preconditions:
  - "Signed into Inbox Zero as the test account"
cleanup:
  - "Revert any settings changed by this flow"
tags:
  - settings
  - regression
---

## Goal

Describe the user-visible behavior being verified.

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
