-- Drop the category-filter condition and the automate flag. Category
-- filters were replaced by learned patterns and AI conditions; every rule
-- has been automated since PENDING execution was removed, so automate was
-- always true. Dropping columns discards the stored values, including the
-- RuleHistory snapshots of them.
DROP TABLE IF EXISTS "_CategoryToRule";

ALTER TABLE "Rule" DROP COLUMN IF EXISTS "automate";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "categoryFilterType";

ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "automate";
ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "categoryFilterType";
ALTER TABLE "RuleHistory" DROP COLUMN IF EXISTS "categoryFilters";

DROP TYPE IF EXISTS "CategoryFilterType";
