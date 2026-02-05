---
id: only-one-draft-in-outlook-thread
title: "Only one draft exists per thread in Outlook"
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
---

## Goal

Verify that when 2 messages that trigger the "To Reply" rule are received in the same thread in Outlook, only the latest one has a draft created.

## Preconditions

- Signed into Inbox Zero as a test account.
- Signed into Gmail test account in another tab.
- Signed into Outlook test account in another tab.
- Inbox Zero is connected to both Gmail and Outlook.

## Steps

1. In Inbox Zero (getinboxzero.com), assign the Outlook test account in the upper-left user selector.
2. Open the Assistant page.
3. Find the "To Reply" rule and verify it is enabled; if not, toggle it on and save.
4. In Gmail, compose a new email to the Outlook test account.
5. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Movie preferences" - DO NOT use subject/body that request calendar availability).
6. Send the email.
7. In Outlook, wait for the message to arrive in the inbox.
8. Wait a bit longer for automation to run.
9. Verify the message shows the "To Reply" category in Outlook.
10. Open the message (or inspect the conversation list) and confirm a reply draft exists for the thread.
11. Go back to Outlook inbox.
12. In Gmail, go to the Sent folder and open the email that was just sent.
13. Click on the reply button to create a new email in the same thread.
14. Write a new body that is related to the thread and requires a reply.
15. Send the email.
16. In Outlook, wait for the new message to arrive in the inbox.
17. Wait a bit longer for automation to run.
18. Verify that the thread still shows the "To Reply" category in Outlook.
19. Open the message (or inspect the conversation list) and confirm a reply draft exists for the last received email in the thread only. The oldest email should NOT have a draft anymore.

## Expected results

- The To Reply rule is enabled in Inbox Zero.
- The Gmail email arrives in Outlook.
- The Outlook message is categorized "To Reply".
- A reply draft is present for the last email received in the thread.

## Failure indicators

- The To Reply rule cannot be enabled or does not remain enabled after saving.
- The message arrives without the "To Reply" category after the wait window.
- No reply draft is created for the thread.
- All messages from the thread have an associated draft.

## Cleanup

- close all tabs used for the test.
