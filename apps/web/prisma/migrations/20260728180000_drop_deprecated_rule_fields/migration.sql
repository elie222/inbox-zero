-- Drop the category-filter condition and the automate flag. Category
-- filters were replaced by learned patterns and AI conditions; every rule
-- has been automated since PENDING execution was removed, so automate was
-- always true. Dropping columns discards the stored values, including the
-- RuleHistory snapshots of them.

-- bump_rules_revision_from_rule fires on UPDATE OF an explicit column list
-- that names both columns, so Postgres refuses to drop them while it exists.
-- Recreate it afterwards over the columns that remain.
DROP TRIGGER IF EXISTS bump_rules_revision_from_rule ON "Rule";

DROP TABLE IF EXISTS "_CategoryToRule";

ALTER TABLE "Rule" DROP COLUMN IF EXISTS "automate";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "categoryFilterType";

ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "automate";
ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "categoryFilterType";
ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "categoryFilters";

DROP TYPE IF EXISTS "CategoryFilterType";

CREATE TRIGGER bump_rules_revision_from_rule
AFTER INSERT OR DELETE OR UPDATE OF
  name,
  enabled,
  "runOnThreads",
  "conditionalOperator",
  instructions,
  "groupId",
  "from",
  "to",
  subject,
  body,
  "systemType",
  "promptText"
ON "Rule"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_rule();
