-- Marking a thread as spam applied the spam label to every message in it, and the webhook
-- learned a cold email pattern per message. Junking a reply chain therefore blacklisted the
-- account owner and their colleagues alongside the actual sender. Those patterns then labelled,
-- archived, and auto-replied to internal senders. The learning path no longer does this; the
-- rows below are the ones it already created.
--
-- Only non-excluded patterns are removed. A row with "exclude" = true whitelists a sender, so
-- deleting it would undo a correction the user already made. Patterns added by hand are
-- intentional and are left alone.
--
-- "source" is not a reliable filter here: a row created by spam learning has its source
-- overwritten when a later message from the same sender re-upserts the pattern. The internal
-- sender check is what identifies these rows.
--
-- The public provider list mirrors PUBLIC_EMAIL_DOMAINS in apps/web/utils/email.ts as of this
-- migration. It is inlined rather than shared because a migration runs once against a fixed
-- dataset, so later additions to that list do not change what this statement should remove.

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
    -- The owner's own address, whatever domain they are on.
    LOWER(group_item."value") = LOWER(account."email")
    -- A colleague. Only company domains count, since sharing a public provider says
    -- nothing about affiliation.
    OR (
      LOWER(SPLIT_PART(group_item."value", '@', 2))
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
