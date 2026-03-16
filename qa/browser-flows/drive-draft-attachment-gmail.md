---
id: drive-draft-attachment-gmail
title: "Draft reply attaches approved Drive PDF"
resources:
  - conversation-rules
  - gmail-account
  - google-drive-account
---

## Goal

Verify that a draft reply rule can search an approved Google Drive folder and attach the relevant PDF to the generated Gmail draft.

## Preconditions

- Signed into Inbox Zero as a test user with a connected Gmail inbox.
- Signed into Google Drive for the same test user in another tab.
- Signed into a secondary Gmail account that can send a test message to the Inbox Zero account.
- Google Drive is connected in Inbox Zero with access that can browse existing files.
- A Drive test folder exists with at least one relevant PDF and one irrelevant PDF.
- The relevant PDF has a distinctive filename that can be requested in the email, for example `Property Packet - QA.pdf`.

## Steps

1. In Google Drive, open the test folder and confirm the relevant PDF and at least one irrelevant PDF are present.
2. In Inbox Zero, switch to the Gmail test account in the account selector.
3. Open the Assistant page and create a new rule named `QA Drive draft attachment`, or edit an existing dedicated QA rule if one already exists.
4. Configure the rule so it only matches a unique subject token, for example `QA drive attachment request`.
5. Add a `Draft reply` action with instructions that tell the assistant to answer the request and attach the most relevant approved Drive document when one is found.
6. In the draft attachment source picker, add the Google Drive test folder as an approved source and save the rule.
7. In the secondary Gmail account, send an email to the Inbox Zero Gmail account with the unique subject token and body text that clearly requests the relevant PDF by name or property reference.
8. In Gmail for the Inbox Zero account, wait for the inbound message to arrive and then wait for the automation window to complete.
9. Open the thread and view the generated draft reply.
10. Confirm the draft has the expected PDF attached.
11. Confirm the draft body references sending or attaching the requested document.
12. Confirm no irrelevant PDF from the same folder was attached.

## Expected results

- The rule saves successfully with the approved Drive folder.
- The test message matches the rule and produces a draft reply.
- The generated draft includes the expected PDF from the approved Drive folder.
- The draft body is consistent with the attachment that was selected.
- Unrelated PDFs in the same folder are not attached.

## Failure indicators

- The Drive source picker cannot load folders or cannot save the selected folder.
- The rule saves without the approved source persisting after refresh.
- The inbound email arrives but no draft is created after the wait window.
- The draft is created without an attachment when the request clearly matches the PDF.
- The wrong PDF is attached, or multiple irrelevant PDFs are attached.
- The draft text claims an attachment was included when none is attached.

## Cleanup

- Disable or delete the dedicated QA rule.
- Delete the generated draft reply from Gmail.
- Leave the Drive test folder in its original state unless the run created temporary files.
