-- Migrate prompt fields to regular fields with template syntax.
UPDATE "Action"
SET
  "label" = CASE
    WHEN "labelPrompt" = '' THEN '{{}}'
    WHEN "labelPrompt" IS NOT NULL THEN '{{' || "labelPrompt" || '}}'
  END
WHERE "labelPrompt" IS NOT NULL;

UPDATE "Action"
SET
  "subject" = CASE
    WHEN "subjectPrompt" = '' THEN '{{}}'
    WHEN "subjectPrompt" IS NOT NULL THEN '{{' || "subjectPrompt" || '}}'
  END
WHERE "subjectPrompt" IS NOT NULL;

UPDATE "Action"
SET
  "content" = CASE
    WHEN "contentPrompt" = '' THEN '{{}}'
    WHEN "contentPrompt" IS NOT NULL THEN '{{' || "contentPrompt" || '}}'
  END
WHERE "contentPrompt" IS NOT NULL;

UPDATE "Action"
SET
  "to" = CASE
    WHEN "toPrompt" = '' THEN '{{}}'
    WHEN "toPrompt" IS NOT NULL THEN '{{' || "toPrompt" || '}}'
  END
WHERE "toPrompt" IS NOT NULL;

UPDATE "Action"
SET
  "cc" = CASE
    WHEN "ccPrompt" = '' THEN '{{}}'
    WHEN "ccPrompt" IS NOT NULL THEN '{{' || "ccPrompt" || '}}'
  END
WHERE "ccPrompt" IS NOT NULL;

UPDATE "Action"
SET
  "bcc" = CASE
    WHEN "bccPrompt" = '' THEN '{{}}'
    WHEN "bccPrompt" IS NOT NULL THEN '{{' || "bccPrompt" || '}}'
  END
WHERE "bccPrompt" IS NOT NULL;