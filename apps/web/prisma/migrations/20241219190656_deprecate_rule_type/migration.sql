-- Making sure that all rules are cleaned up before we deprecate the type column

-- Clean up AI rules
UPDATE "Rule"
SET "groupId" = NULL,
    "from" = NULL,
    "to" = NULL,
    "subject" = NULL,
    "body" = NULL
WHERE "type" = 'AI';

-- Clean up GROUP rules
UPDATE "Rule"
SET "instructions" = NULL,
    "from" = NULL,
    "to" = NULL,
    "subject" = NULL,
    "body" = NULL,
    "categoryFilterType" = NULL
WHERE "type" = 'GROUP';

-- Clean up STATIC rules
UPDATE "Rule"
SET "instructions" = NULL,
    "groupId" = NULL,
    "categoryFilterType" = NULL
WHERE "type" = 'STATIC';
