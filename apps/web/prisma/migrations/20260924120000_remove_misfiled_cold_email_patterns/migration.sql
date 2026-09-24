-- The cold-email rule learned senders that aren't cold outreach: ones another
-- enabled rule already files, and colleagues at the account's own domain.
-- A learned pattern short-circuits the cold-email checks on every later email,
-- so these are removed. Only AI-inferred inclusions are touched.

-- Older patterns stored the whole From header ("Name <sender@example.com>"), so
-- every comparison below reads the address out of the value first.

-- 1. Another enabled rule already includes the sender. Rules match FROM
-- patterns as substrings (see findMatchingGroupItem); here that is covered for
-- the pattern shapes used in practice (full address, "@domain", "domain") as
-- equality keys, so it stays a hash join on large installs. Rarer partial
-- patterns are left alone, which only keeps a pattern, never deletes extra.
DELETE FROM "GroupItem"
WHERE "id" IN (
  SELECT cold."id"
  FROM (
    SELECT gi."id", g."emailAccountId", r."id" AS "ruleId",
      lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value")) AS "address"
    FROM "GroupItem" gi
    JOIN "Group" g ON gi."groupId" = g."id"
    JOIN "Rule" r ON r."groupId" = g."id"
    WHERE r."systemType" = 'COLD_EMAIL'
      AND gi."source" = 'AI'
      AND gi."type" = 'FROM'
      AND NOT gi."exclude"
  ) cold
  CROSS JOIN LATERAL (VALUES
    (cold."address"),
    ('@' || split_part(cold."address", '@', 2)),
    (split_part(cold."address", '@', 2))
  ) AS candidate("key")
  JOIN (
    SELECT og."emailAccountId", orule."id" AS "ruleId",
      lower(coalesce(substring(other."value" FROM '<([^>]+)>'), other."value")) AS "pattern"
    FROM "GroupItem" other
    JOIN "Group" og ON other."groupId" = og."id"
    JOIN "Rule" orule ON orule."groupId" = og."id"
    WHERE orule."enabled"
      AND other."type" = 'FROM'
      AND NOT other."exclude"
  ) claim
    ON claim."emailAccountId" = cold."emailAccountId"
    AND claim."pattern" = candidate."key"
    AND claim."ruleId" <> cold."ruleId"
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
  AND split_part(lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value")), '@', 2) = btrim(split_part(lower(ea."email"), '@', 2))
  AND lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value")) <> lower(ea."email")
  AND btrim(split_part(lower(ea."email"), '@', 2)) NOT IN (
    'gmail.com','googlemail.com','yahoo.com','ymail.com','rocketmail.com','hotmail.com',
    'outlook.com','live.com','msn.com','aol.com','icloud.com','me.com','mac.com',
    'proton.me','protonmail.com','protonmail.ch','pm.me','zoho.com','yandex.com',
    'yandex.ru','ya.ru','fastmail.com','fastmail.fm','gmx.com','gmx.net','gmx.de',
    'hey.com','mail.com'
  );
