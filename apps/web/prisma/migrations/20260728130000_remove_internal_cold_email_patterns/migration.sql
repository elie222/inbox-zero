-- Marking a thread as spam labelled every message in it, so the webhook learned a cold email
-- pattern per message and blacklisted the account owner and their colleagues alongside the
-- actual sender. The learning path no longer does this; these are the rows it already created.
--
-- Removes the owner's own address on any source, plus same-domain rows still carrying
-- LABEL_ADDED, which only spam learning sets.
--
-- Same-domain rows on other sources are left alone. Source is not conclusive, since a later
-- message from the same sender re-upserts the pattern and overwrites it. And on a shared
-- institutional domain such as a university or a large ISP, two addresses are usually
-- strangers, so an unsolicited pitch between them is a real cold email worth keeping.
--
-- Excluded rows are left alone: they whitelist a sender, so deleting one would undo a
-- correction the user already made. Hand-added rows are intentional.
--
-- The public provider list is a snapshot of PUBLIC_EMAIL_DOMAINS rather than a shared
-- reference, because later additions to that list should not change what this removes.

BEGIN;

DELETE FROM "GroupItem" AS group_item
USING "Rule" AS cold_email_rule, "EmailAccount" AS account
WHERE group_item."groupId" = cold_email_rule."groupId"
  AND cold_email_rule."emailAccountId" = account."id"
  AND cold_email_rule."systemType" = 'COLD_EMAIL'
  AND group_item."type" = 'FROM'
  AND group_item."exclude" = false
  AND (group_item."source" IS NULL OR group_item."source" <> 'USER')
  AND (
    LOWER(group_item."value") = LOWER(account."email")
    OR (
      group_item."source" = 'LABEL_ADDED'
      AND LOWER(SPLIT_PART(group_item."value", '@', 2))
        = LOWER(SPLIT_PART(account."email", '@', 2))
      AND LOWER(SPLIT_PART(account."email", '@', 2)) NOT IN (
        'gmail.com',
        'yahoo.com',
        'hotmail.com',
        'outlook.com',
        'aol.com',
        'icloud.com',
        'me.com',
        'protonmail.com',
        'zoho.com',
        'yandex.com',
        'fastmail.com',
        'gmx.com',
        'hey.com',
        'mail.com'
      )
    )
  );

COMMIT;
