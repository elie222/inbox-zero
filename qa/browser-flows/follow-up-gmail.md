---
id: follow-up-gmail
title: "Follow-ups in Gmail account"
resources:
  - conversation-rules
  - gmail-account
  - outlook-account
---

## Goal

Verify that emails are correctly marked as follow-up and that follow-up drafts are generated for sent emails.

## Preconditions

- Signed into Inbox Zero as a test account.
- Signed into Gmail test account in another tab.
- Signed into Outlook test account in another tab.
- Inbox Zero is connected to both Gmail and Outlook.

## Steps

1. In Inbox Zero, assign the Gmail test account in the upper-left user selector. 
2. Open the Assistant page.
3. Navigate to the Settings tab. 
4. Find "Follow-up reminders" and verify if it's enabled. If not, toggle it on. 
5. Click "Configure" next to "Follow up reminders". 
6. Configure both options ("Remind me when they haven't replied after" and "Remind me when I haven't replied after") to "0.01 days"
7. Find the "auto-generate drafts" option and verify if it's enabled. If not, toggle it on. 
8. Click "Save." and confirm the settings are saved (a green confirmation toast appears at the bottom right)
9. In Outlook (outlook.com), compose a new email to the Gmail test account (type the gmail address directly in the "To" field. Do not click the "TO" text).
10. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Movie preferences" - DO NOT use subject/body that request calendar availability).
11. Send the email.
12. In Gmail (mail.google.com), wait for the message to arrive in the inbox.
13. In Gmail (mail.google.com), compose a new email to the Outlook test account.
14. Use a subject/body that clearly needs a reply (for example: "Quick question" and "Movie preferences" - DO NOT use subject/body that request calendar availability).
15. Send the email.
16. Wait about 15 minutes.
17. In Gmail, verify in the inbox that the email received from Outlook test account has the "Follow-up" label
18. Verify that the received email does not have a follow-up draft.
19. Switch to "Sent" folder and verify that the email sent to the Outlook test account has the "Follow-up" label
20. Open the sent message (or inspect the conversation list) and confirm a follow-up draft exists for the thread.
21. Verify that the draft email body talks about a follow-up to the previously sent email. 

## Expected results

- The "Follow Up" rule is enabled and configured in Inbox Zero.
- The "Follow-up" rule is applied to both sent and received emails within the time frame configured in Inbox Zero.
- A follow-up draft is generated for sent emails. 
- A follow-up draft is not generated for received emails. 

## Failure indicators

- The Follow-up rule cannot be enabled or does not remain enabled after saving.
- The follow-up rule is not applied to the emails after the configured time frame is up.
- A follow-up draft is not generated for sent emails after the follow-up rule is applied.
- A follow-up draft is generated for received emails after the follow-up rule is applied. 

## Cleanup

- Undo all changes made to the InboxZero account after the test is completed. 
- close all tabs used for the test.
