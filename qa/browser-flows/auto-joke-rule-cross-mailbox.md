---
id: auto-joke-rule-cross-mailbox
title: "Auto-joke rule applies label in Outlook"
description: "Create a rule in Inbox Zero, send a Gmail message to Outlook, and verify the expected label is applied."
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
parallel_safe: false
timeout_minutes: 25
preconditions:
  - "Signed into Inbox Zero as a test account"
  - "Signed into Gmail test account in another tab"
  - "Signed into Outlook test account in another tab"
  - "Inbox Zero is connected to both Gmail and Outlook"
tags:
  - rules
  - gmail
  - outlook
---

## Goal

Validate that a new conversation rule triggers the correct automated response and label application across mail providers.

## Steps

1. In Inbox Zero, go to Assistant Rules.
2. Add a rule: if an email asks for a joke, auto-reply with a joke and apply the "Joke" label.
3. Save the rule and confirm it appears in the rules list.
4. In Gmail, send an email to the Outlook test account with a subject/body that asks for a joke.
5. Wait for delivery to Outlook and for Inbox Zero automation to run.
6. In Outlook, locate the new message.
7. Verify the "Joke" label/category is applied to the message.
8. (Optional) Open the thread and confirm the auto-reply was sent.

## Expected results

- The rule is saved and visible in Inbox Zero.
- The Gmail message arrives in Outlook.
- The Outlook message has the expected "Joke" label/category applied.
- (Optional) An auto-reply containing a joke is sent.

## Cleanup

- Remove the test rule from Inbox Zero.
- Remove any test labels/categories if they were created.
