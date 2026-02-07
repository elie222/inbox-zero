---
id: calendar-availability-rule-gmail-to-outlook
title: "Calendar rule applies category and draft upon availability request"
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
---

## Goal

Verify that enabling the Calendar rule results in a Outlook category and a reply draft for a message that needs a response.

## Preconditions

- Signed into Inbox Zero as a test account.
- Signed into Gmail test account in another tab.
- Signed into Outlook test account in another tab.
- Inbox Zero is connected to both Gmail and Outlook.

## Steps

1. In Inbox Zero (getinboxzero.com), assign the Outlook test account in the upper-left user selector. 
2. open the Assistant page.
3. Find the "Calendar" rule and verify it is enabled; if not, toggle it on and save.
4. In Gmail (mail.google.com), compose a new email to the Outlook test account.
5. Use a subject/body that clearly requestes calendar availability and needs a reply (for example: "Meeting tomorrow").
6. Send the email.
7. In Outlook (outlook.com),  wait for the message to arrive in the inbox.
8. Wait a bit longer for automation to run.
9. Verify the message shows the "Calendar" category in Outlook.
10. Open the message and confirm a reply draft exists for the thread and that availability is provided in the body.

## Expected results

- The Calendar rule is enabled in Inbox Zero.
- The Gmail email arrives in Outlook.
- The Outlook message is categorized as "Calendar".
- A reply draft is present for the thread.

## Failure indicators

- The Calendar rule cannot be enabled or does not remain enabled after saving.
- The message cannot be found in Outlook after the wait window.
- The message arrives without the "Calendar" category after the wait window.
- No reply draft is created for the thread.

## Cleanup

- close all tabs used for the test.
