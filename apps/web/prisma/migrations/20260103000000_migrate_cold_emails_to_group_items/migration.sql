-- CreateEnum
CREATE TYPE "GroupItemSource" AS ENUM ('AI', 'USER');

-- AlterTable
ALTER TABLE "GroupItem" ADD COLUMN "messageId" TEXT;
ALTER TABLE "GroupItem" ADD COLUMN "reason" TEXT;
ALTER TABLE "GroupItem" ADD COLUMN "source" "GroupItemSource";
ALTER TABLE "GroupItem" ADD COLUMN "threadId" TEXT;

-- Migrate ColdEmail data to GroupItem
-- This migration moves historical cold email data from the deprecated ColdEmail table
-- to the unified GroupItem table (learned patterns system)

-- Step 1: Create Groups for Cold Email rules that don't have one yet
-- We append a unique suffix to handle potential name conflicts
DO $$
DECLARE
  rule_record RECORD;
  new_group_id TEXT;
  group_name TEXT;
BEGIN
  FOR rule_record IN 
    SELECT r.id, r.name, r."emailAccountId"
    FROM "Rule" r
    WHERE r."systemType" = 'COLD_EMAIL'
      AND r."groupId" IS NULL
  LOOP
    new_group_id := gen_random_uuid()::TEXT;
    group_name := rule_record.name;
    
    -- Check if a group with this name already exists
    IF EXISTS (
      SELECT 1 FROM "Group" g 
      WHERE g.name = group_name AND g."emailAccountId" = rule_record."emailAccountId"
    ) THEN
      -- Use existing group if it exists
      UPDATE "Rule" 
      SET "groupId" = (
        SELECT id FROM "Group" g 
        WHERE g.name = group_name AND g."emailAccountId" = rule_record."emailAccountId"
        LIMIT 1
      )
      WHERE id = rule_record.id;
    ELSE
      -- Create new group
      INSERT INTO "Group" (id, "createdAt", "updatedAt", name, "emailAccountId")
      VALUES (new_group_id, NOW(), NOW(), group_name, rule_record."emailAccountId");
      
      UPDATE "Rule" SET "groupId" = new_group_id WHERE id = rule_record.id;
    END IF;
  END LOOP;
END $$;

-- Step 2: Migrate ColdEmail records to GroupItem
INSERT INTO "GroupItem" (
  id,
  "createdAt",
  "updatedAt",
  "groupId",
  type,
  value,
  exclude,
  reason,
  "threadId",
  "messageId",
  source
)
SELECT 
  gen_random_uuid() as id,
  ce."createdAt",
  ce."updatedAt",
  r."groupId",
  'FROM'::"GroupItemType" as type,
  ce."fromEmail" as value,
  CASE 
    WHEN ce.status = 'USER_REJECTED_COLD' THEN true 
    ELSE false 
  END as exclude,
  ce.reason,
  ce."threadId",
  ce."messageId",
  CASE 
    WHEN ce.status = 'USER_REJECTED_COLD' THEN 'USER'::"GroupItemSource"
    ELSE 'AI'::"GroupItemSource"
  END as source
FROM "ColdEmail" ce
JOIN "Rule" r ON r."emailAccountId" = ce."emailAccountId" AND r."systemType" = 'COLD_EMAIL'
WHERE r."groupId" IS NOT NULL
  AND ce."fromEmail" IS NOT NULL
  -- Avoid duplicates: only insert if this pattern doesn't already exist
  AND NOT EXISTS (
    SELECT 1 FROM "GroupItem" gi
    WHERE gi."groupId" = r."groupId"
      AND gi.type = 'FROM'
      AND gi.value = ce."fromEmail"
  );

