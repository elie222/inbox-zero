---
id: flow-id
title: "Short flow title"
description: "What this flow validates in 1-2 sentences."
resources:
  - assistant-settings
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

## Cleanup

- Revert or remove anything created during the test.
