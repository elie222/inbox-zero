-- Marking a thread as spam applied the spam label to every message in it, and the webhook
-- learned a cold email pattern per message. Junking a reply chain therefore blacklisted the
-- account owner and their colleagues alongside the actual sender. Those patterns label,
-- archive, and auto-reply to internal senders. The learning path no longer does this; the rows
-- below are the ones it already created.
--
-- Two cases are removed:
--
--   1. Any pattern naming the account owner's own address. Nobody is their own cold emailer,
--      so this is wrong however it was created.
--   2. Patterns naming someone on the owner's company domain that still carry LABEL_ADDED,
--      which only the spam learning path sets.
--
-- Patterns on the owner's domain with any other source are deliberately left alone. Provenance
-- is not conclusive there, because a row created by spam learning has its source overwritten
-- when a later message from the same sender re-upserts the pattern. But shared institutional
-- domains are real: at a university or a large ISP two addresses on one domain are often
-- strangers, and an unsolicited pitch between them is a genuine cold email. Deleting every
-- same-domain pattern would throw those away, so only the provably spam-derived ones go.
--
-- Excluded patterns are also left intact. A row with "exclude" = true whitelists a sender, so
-- deleting it would undo a correction the user already made by removing the label. Patterns
-- added by hand are intentional.
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
