-- AI-inferred sender patterns on custom rules used to survive the user removing
-- that rule's label, so the label kept coming back. Drop the ones contradicted by
-- a label removal recorded after the pattern was last saved.
DELETE FROM "GroupItem" gi
USING "Group" g, "Rule" r
WHERE gi."groupId" = g."id"
  AND r."groupId" = g."id"
  AND r."systemType" IS NULL
  AND gi."source" = 'AI'
  AND gi."type" = 'FROM'
  AND NOT gi."exclude"
  AND EXISTS (
    SELECT 1
    FROM "ClassificationFeedback" cf
    WHERE cf."emailAccountId" = g."emailAccountId"
      AND cf."ruleId" = r."id"
      AND cf."eventType" = 'LABEL_REMOVED'
      AND cf."createdAt" > gi."updatedAt"
      -- Older patterns stored the whole From header ("Name <sender@example.com>").
      AND lower(cf."sender") = lower(coalesce(substring(gi."value" FROM '<([^>]+)>'), gi."value"))
  );
