---
id: reply-with-unedited-draft-from-gmail
title: "Reply with unedited draft from Gmail"
description: "Make sure that when you reply from Gmail with an unedited auto-generated draft, that draft is not deleted permanently after it's sent. "
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

Verify that when you reply from Gmail with an unedited auto-generated draft, that draft is not deleted permanently after it's sent.

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
10. Open the message and confirm a reply draft exists for the thread.
11. Click on Send to send the draft as a reply (DO NOT edit the draft. just send it as is). 
12. Wait for the message to be sent. 
13. Wait about five minutes. 
14. Refresh the page. 
15. Go to the Sent Items folder and verify the message is there. 
16. In the inbox, inspect the thread again and verify the message (draft) that was just sent is still displayed in the thread. 

## Expected results

- The Outlook email arrives in Gmail.
- A reply draft is present for the thread.
- The reply message is not deleted after it is sent.

## Failure indicators

- The To Reply rule cannot be enabled or does not remain enabled after saving.
- No reply draft is created for the thread.
- The reply message is deleted from the thread after it is sent.

## Cleanup

- close all tabs used for the test.
