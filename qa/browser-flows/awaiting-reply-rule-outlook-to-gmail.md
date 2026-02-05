---
id: awaiting-reply-rule-outlook-to-gmail
title: "Awaiting Reply rule applies category to sent message"
description: "Ensure the Awaiting Reply rule is enabled and that Outlook -> Gmail messages get categorized."
category: email
estimated_duration: 180s
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
requires:
  - authenticated_session
  - gmail_account
  - outlook_account
conflicts_with: []
parallel_safe: false
timeout_minutes: 20
preconditions:
  - "Signed into Inbox Zero as a test account"
  - "Signed into Outlook test account in another tab"
  - "Signed into Gmail test account in another tab"
  - "Inbox Zero is connected to both Gmail and Outlook"
cleanup:
  - close all tabs used for the test
tags:
  - rules
  - outlook
  - gmail
---

## Goal

Verify that enabling the Awaiting Reply rule results in an Outlook category for a message that needs a response.

## Steps

1. In Inbox Zero, assign the Outlook test account in the upper-left user selector.
2. Open the Assistant page.
3. Find the "Awaiting Reply" rule and verify it is enabled; if not, toggle it on and save.
4. In Outlook (outlook.com), compose a new email to the Gmail test account (type the gmail address directly in the "To" field. Do not click the "TO" text).
5. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Movie preferences" - DO NOT use subject/body that request calendar availability).
6. Send the email.
7. Navigate to the "Sent items" folder in Outlook.
8. Verify the email that was just sent is present in the folder and shows the "Awaiting Reply" category in Outlook.

## Expected results

- The Awaiting Reply rule is enabled in Inbox Zero.
- The Outlook email is sent and in the "Sent" folder.
- The message is categorized as "Awaiting Reply".

## Failure indicators

- The Awaiting Reply rule cannot be enabled or does not remain enabled after saving.
- The message cannot be found in the Sent folder.
- The message is not categorized as "Awaiting Reply" after the wait window.

## Cleanup

- close all tabs used for the test.
