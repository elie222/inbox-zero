---
id: assistant-writing-style
title: "Assistant writing style persists"
description: "Verify that changing the Assistant writing style persists after saving and refreshing."
resources:
  - assistant-settings
parallel_safe: false
timeout_minutes: 10
preconditions:
  - "Signed into Inbox Zero as a test account"
  - "Assistant settings page is accessible"
tags:
  - settings
  - assistant
---

## Goal

Ensure writing style changes are saved and persist across a page refresh.

## Steps

1. Open the Assistant settings page.
2. Change the writing style to a distinctive value.
3. Click Save.
4. Refresh the page.
5. Confirm the writing style still shows the new value.

## Expected results

- Save completes without error.
- After refresh, the writing style remains the new value.

## Cleanup

- Restore the previous writing style if needed.
