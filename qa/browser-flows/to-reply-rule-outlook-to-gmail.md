---
id: to-reply-rule-outlook-to-gmail
title: "To Reply rule applies label and draft"
description: "Ensure the To Reply rule is enabled and that Outlook -> Gmail messages get labeled and drafted."
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
tags:
  - rules
  - outlook
  - gmail
---

## Goal

Verify that enabling the To Reply rule results in a Gmail label and a reply draft for a message that needs a response.

## Steps

1. In Inbox Zero, open the Assistant page.
2. Find the "To Reply" rule and verify it is enabled; if not, toggle it on and save.
3. In Outlook (outlook.com), compose a new email to the Gmail test account.
4. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Can you confirm availability for a call tomorrow?").
5. Send the email.
6. In Gmail, wait for the message to arrive in the inbox.
7. Wait a bit longer for automation to run.
8. Verify the message shows the "To Reply" label in Gmail.
9. Open the message (or inspect the conversation list) and confirm a reply draft exists for the thread.

## Expected results

- The To Reply rule is enabled in Inbox Zero.
- The Outlook email arrives in Gmail.
- The Gmail message is labeled "To Reply".
- A reply draft is present for the thread.

## Failure indicators

- The To Reply rule cannot be enabled or does not remain enabled after saving.
- The message arrives without the "To Reply" label after the wait window.
- No reply draft is created for the thread.

## Cleanup

- None.
