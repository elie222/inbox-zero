---
id: calendar-availability-rule-outlook-to-gmail
title: "Calendar rule applies label and draft upon availability request"
description: "Ensure the Calendar rule is enabled and that Outlook -> Gmail messages get labeled and drafted upon availability request."
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

Verify that enabling the Calendar rule results in a Gmail label and a reply draft for a message that requests calendar availability.

## Steps

1. In Inbox Zero (getinboxzero.com), assign the Gmail test account in the upper-left user selector.
2. Open the Assistant page.
3. Find the "Calendar" rule and verify it is enabled; if not, toggle it on and save.
4. In Outlook (outlook.com), compose a new email to the Gmail test account (type the Gmail address directly in the "To" field. Do not click the "TO" text).
5. Use a subject/body that clearly requests calendar availability and needs a reply (for example: "Meeting tomorrow" with body asking for availability).
6. Send the email.
7. In Gmail (mail.google.com), wait for the message to arrive in the inbox.
8. Wait a bit longer for automation to run.
9. Verify the message shows the "Calendar" label in Gmail.
10. Open the message and confirm a reply draft exists for the thread and that availability is provided in the body.

## Expected results

- The Calendar rule is enabled in Inbox Zero.
- The Outlook email arrives in Gmail.
- The Gmail message is labeled as "Calendar".
- A reply draft is present for the thread with availability information.

## Failure indicators

- The Calendar rule cannot be enabled or does not remain enabled after saving.
- The message cannot be found in Gmail after the wait window.
- The message arrives without the "Calendar" label after the wait window.
- No reply draft is created for the thread.

## Cleanup

- close all tabs used for the test.
