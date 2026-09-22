-- The cold-email rule learned senders that aren't cold outreach: ones another
-- enabled rule already files, and colleagues at the account's own domain.
-- A learned pattern short-circuits the cold-email checks on every later email,
-- so these are removed. Only AI-inferred inclusions are touched.

-- Older patterns stored the whole From header ("Name <sender@example.com>"), so
-- every comparison below reads the address out of the value first.

-- 1. Sender is already an include pattern on another enabled rule.
DELETE FROM "GroupItem" gi
USING "Group" g, "Rule" r
WHERE gi."groupId" = g."id"
  AND r."groupId" = g."id"
  AND r."systemType" = 'COLD_EMAIL'
  AND gi."source" = 'AI'
  AND gi."type" = 'FROM'
  AND NOT gi."exclude"
  AND EXISTS (
    SELECT 1
    FROM "GroupItem" other
    JOIN "Group" og ON other."groupId" = og."id"
    JOIN "Rule" orule ON orule."groupId" = og."id"
    WHERE og."emailAccountId" = g."emailAccountId"
      AND orule."id" <> r."id"
      AND orule."enabled"
      AND other."type" = 'FROM'
      AND NOT other."exclude"
      AND lower(coalesce(substring(other."value" FROM '<([^>]+)>'), other."value"))
        = lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value"))
  );

-- 2. Sender is a colleague on the account's own domain. Public providers are
-- excluded, matching isPublicEmailDomain in apps/web/utils/email.ts.
DELETE FROM "GroupItem" gi
USING "Group" g, "Rule" r, "EmailAccount" ea
WHERE gi."groupId" = g."id"
  AND r."groupId" = g."id"
  AND ea."id" = g."emailAccountId"
  AND r."systemType" = 'COLD_EMAIL'
  AND gi."source" = 'AI'
  AND gi."type" = 'FROM'
  AND NOT gi."exclude"
  AND split_part(lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value")), '@', 2) = split_part(lower(ea."email"), '@', 2)
  AND lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value")) <> lower(ea."email")
  AND split_part(lower(ea."email"), '@', 2) NOT IN (
    'gmail.com','googlemail.com','yahoo.com','ymail.com','rocketmail.com','hotmail.com',
    'outlook.com','live.com','msn.com','aol.com','icloud.com','me.com','mac.com',
    'proton.me','protonmail.com','protonmail.ch','pm.me','zoho.com','yandex.com',
    'yandex.ru','ya.ru','fastmail.com','fastmail.fm','gmx.com','gmx.net','gmx.de',
    'hey.com','mail.com'
  );
