---
id: only-one-draft-in-gmail-thread
title: "Only one draft exists per thread in Gmail"
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
---

## Goal

Verify that when 2 messages that trigger the "To Reply" rule are received in the same thread, only the latest one has a draft created.

## Preconditions

- Signed into Inbox Zero as a test account.
- Signed into Gmail test account in another tab.
- Signed into Outlook test account in another tab.
- Inbox Zero is connected to both Gmail and Outlook.

## Steps

1. In Inbox Zero (getinboxzero.com), assign the Gmail test account in the upper-left user selector. 
2. Open the Assistant page.
3. Find the "To Reply" rule and verify it is enabled; if not, toggle it on and save.
4. In Outlook (outlook.com), compose a new email to the Gmail test account (type the gmail address directly in the "To" field. Do not click the "TO" text).
5. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Movie preferences" - DO NOT use subject/body that request calendar availability).
6. Send the email.
7. In Gmail, wait for the message to arrive in the inbox.
8. Wait a bit longer for automation to run.
9. Verify the message shows the "To Reply" label in Gmail.
10. Open the message (or inspect the conversation list) and confirm a reply draft exists for the thread.
11. Go back to Gmail inbox. 
12. In Outlook, go to the Sent Items folder and open the email that was just sent. 
13. Click on the reply button to create a new email in the same thread. 
14. Write a new body that is related to the thread and requires a reply. 
15. Send an email. 
16. In Gmail, wait for the new message to arrive in the inbox.
17. Wait a bit longer for automation to run.
18. Verify that the thread still shows the "To reply" label in Gmail. 
19. Open the message (or inspect the conversation list) and confirm a reply draft exists for the last received email in the thread only. The oldest email should NOT have a draft anymore.

## Expected results

- The To Reply rule is enabled in Inbox Zero.
- The Outlook email arrives in Gmail.
- The Gmail message is labeled "To Reply".
- A reply draft is present for the last email received in the thread.

## Failure indicators

- The To Reply rule cannot be enabled or does not remain enabled after saving.
- The message arrives without the "To Reply" label after the wait window.
- No reply draft is created for the thread.
- All messages from the thread have an associated draft. 

## Cleanup

- close all tabs used for the test.