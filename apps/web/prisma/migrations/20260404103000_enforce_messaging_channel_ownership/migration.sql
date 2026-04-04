ALTER TABLE "Action"
ADD COLUMN "emailAccountId" TEXT,
ADD COLUMN "messagingChannelEmailAccountId" TEXT;

UPDATE "Action" AS a
SET
  "emailAccountId" = r."emailAccountId",
  "messagingChannelEmailAccountId" = CASE
    WHEN a."messagingChannelId" IS NULL THEN NULL
    ELSE r."emailAccountId"
  END
FROM "Rule" AS r
WHERE a."ruleId" = r.id;

UPDATE "Action" AS a
SET
  "messagingChannelId" = NULL,
  "messagingChannelEmailAccountId" = NULL
WHERE a."messagingChannelId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "MessagingChannel" AS mc
    WHERE mc.id = a."messagingChannelId"
      AND mc."emailAccountId" = a."emailAccountId"
  );

ALTER TABLE "Action"
ALTER COLUMN "emailAccountId" SET NOT NULL;

CREATE UNIQUE INDEX "Rule_id_emailAccountId_key" ON "Rule"("id", "emailAccountId");

CREATE INDEX "Action_emailAccountId_idx" ON "Action"("emailAccountId");
CREATE INDEX "Action_messagingChannelId_messagingChannelEmailAccountId_idx"
ON "Action"("messagingChannelId", "messagingChannelEmailAccountId");

ALTER TABLE "Action"
DROP CONSTRAINT "Action_ruleId_fkey",
DROP CONSTRAINT "Action_messagingChannelId_fkey";

ALTER TABLE "Action"
ADD CONSTRAINT "Action_messagingChannel_owner_check"
CHECK (
  (
    "messagingChannelId" IS NULL
    AND "messagingChannelEmailAccountId" IS NULL
  )
  OR (
    "messagingChannelId" IS NOT NULL
    AND "messagingChannelEmailAccountId" = "emailAccountId"
  )
),
ADD CONSTRAINT "Action_ruleId_emailAccountId_fkey"
FOREIGN KEY ("ruleId", "emailAccountId") REFERENCES "Rule"("id", "emailAccountId")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "Action_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "Action_messagingChannelId_messagingChannelEmailAccountId_fkey"
FOREIGN KEY ("messagingChannelId", "messagingChannelEmailAccountId")
REFERENCES "MessagingChannel"("id", "emailAccountId")
ON DELETE SET NULL ON UPDATE CASCADE;
