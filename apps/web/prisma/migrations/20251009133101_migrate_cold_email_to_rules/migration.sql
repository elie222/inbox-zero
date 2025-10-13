-- Migrate cold email settings from EmailAccount to Rule-based system

-- Step 1: Create Rules for users with cold email blocking enabled
-- We skip: NULL, 'DISABLED', and 'LIST' (LIST means cold email blocker is off)
WITH created_rules AS (
  INSERT INTO "Rule" (
    id,
    "createdAt",
    "updatedAt",
    name,
    enabled,
    automate,
    "runOnThreads",
    instructions,
    "systemType",
    "emailAccountId",
    "conditionalOperator"
  )
  SELECT 
    gen_random_uuid() as id,
    NOW() as "createdAt",
    NOW() as "updatedAt",
    'Cold Email' as name,
    true as enabled,
    true as automate,
    false as "runOnThreads",
    COALESCE(
      "coldEmailPrompt",
      'Examples of cold emails:
- Sell a product or service (e.g., agency pitching their services)
- Recruit for a job position
- Request a partnership or collaboration

Emails that are NOT cold emails include:
- Email from an investor that wants to learn more or invest in the company
- Email from a friend or colleague
- Email from someone you met at a conference
- Email from a customer
- Newsletter
- Password reset
- Welcome emails
- Receipts
- Promotions
- Alerts
- Updates
- Calendar invites

Regular marketing or automated emails are NOT cold emails, even if unwanted.'
    ) as instructions,
    'COLD_EMAIL'::"SystemType" as "systemType",
    ea.id as "emailAccountId",
    'AND'::"LogicalOperator" as "conditionalOperator"
  FROM "EmailAccount" ea
  WHERE ea."coldEmailBlocker" IS NOT NULL
    AND ea."coldEmailBlocker" IN ('LABEL', 'ARCHIVE_AND_LABEL', 'ARCHIVE_AND_READ_AND_LABEL')
    -- Skip email accounts that already have a "Cold Email" rule
    AND NOT EXISTS (
      SELECT 1 FROM "Rule" r 
      WHERE r."emailAccountId" = ea.id 
      AND r.name = 'Cold Email'
    )
  ON CONFLICT ("emailAccountId", "systemType") DO NOTHING
  RETURNING id, "emailAccountId"
)
SELECT * INTO TEMP TABLE temp_created_rules FROM created_rules;

-- Step 2: Create LABEL actions for all created rules
-- All cold email settings (LABEL, ARCHIVE_AND_LABEL, ARCHIVE_AND_READ_AND_LABEL) need a LABEL action
INSERT INTO "Action" (
  id,
  "createdAt",
  "updatedAt",
  type,
  "ruleId",
  label
)
SELECT 
  gen_random_uuid() as id,
  NOW() as "createdAt",
  NOW() as "updatedAt",
  'LABEL'::"ActionType" as type,
  tcr.id as "ruleId",
  'Cold Email' as label
FROM temp_created_rules tcr
JOIN "EmailAccount" ea ON ea.id = tcr."emailAccountId";

-- Step 3: Create ARCHIVE actions for ARCHIVE_AND_LABEL and ARCHIVE_AND_READ_AND_LABEL
INSERT INTO "Action" (
  id,
  "createdAt",
  "updatedAt",
  type,
  "ruleId"
)
SELECT 
  gen_random_uuid() as id,
  NOW() as "createdAt",
  NOW() as "updatedAt",
  'ARCHIVE'::"ActionType" as type,
  tcr.id as "ruleId"
FROM temp_created_rules tcr
JOIN "EmailAccount" ea ON ea.id = tcr."emailAccountId"
WHERE ea."coldEmailBlocker" IN ('ARCHIVE_AND_LABEL', 'ARCHIVE_AND_READ_AND_LABEL');

-- Step 4: Create MARK_READ actions for ARCHIVE_AND_READ_AND_LABEL
INSERT INTO "Action" (
  id,
  "createdAt",
  "updatedAt",
  type,
  "ruleId"
)
SELECT 
  gen_random_uuid() as id,
  NOW() as "createdAt",
  NOW() as "updatedAt",
  'MARK_READ'::"ActionType" as type,
  tcr.id as "ruleId"
FROM temp_created_rules tcr
JOIN "EmailAccount" ea ON ea.id = tcr."emailAccountId"
WHERE ea."coldEmailBlocker" = 'ARCHIVE_AND_READ_AND_LABEL';

-- Step 5: Create DIGEST actions for users who had coldEmailDigest enabled
INSERT INTO "Action" (
  id,
  "createdAt",
  "updatedAt",
  type,
  "ruleId"
)
SELECT 
  gen_random_uuid() as id,
  NOW() as "createdAt",
  NOW() as "updatedAt",
  'DIGEST'::"ActionType" as type,
  tcr.id as "ruleId"
FROM temp_created_rules tcr
JOIN "EmailAccount" ea ON ea.id = tcr."emailAccountId"
WHERE ea."coldEmailDigest" = true;

-- Clean up temp table
DROP TABLE temp_created_rules;

