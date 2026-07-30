-- fromExclude/toExclude/subjectExclude/subjectMatchMode/excludeKnownContacts
-- were added to "Rule" after this trigger's column list was written, so
-- toggling "Is not", "Starts with" or "Skip known contacts" never bumped
-- EmailAccount.rulesRevision. The assistant chat invalidates its cached rule
-- snapshot on that counter, so it kept answering from pre-change state for the
-- rest of the conversation -- the user changed a filter and nothing happened.

-- The trigger names an explicit column list, so it must be dropped and
-- recreated rather than altered (same pattern as
-- 20260728180000_drop_deprecated_rule_fields).
DROP TRIGGER IF EXISTS bump_rules_revision_from_rule ON "Rule";

CREATE TRIGGER bump_rules_revision_from_rule
AFTER INSERT OR DELETE OR UPDATE OF
  name,
  enabled,
  "runOnThreads",
  "conditionalOperator",
  instructions,
  "groupId",
  "from",
  "fromExclude",
  "to",
  "toExclude",
  subject,
  "subjectMatchMode",
  "subjectExclude",
  body,
  "excludeKnownContacts",
  "systemType",
  "promptText"
ON "Rule"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_rule();

-- RuleHistory must snapshot the same condition fields, or a negation-only edit
-- writes a version byte-identical to the one before it and the change is
-- invisible in rule history. Enums are stored as TEXT here, matching how
-- conditionalOperator and systemType are already snapshotted.
-- Single ALTER so this takes one ACCESS EXCLUSIVE lock rather than five. The
-- defaults are constants, so PG11+ adds these without rewriting the table.
ALTER TABLE "RuleHistory"
  ADD COLUMN IF NOT EXISTS "fromExclude" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "toExclude" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "subjectExclude" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "subjectMatchMode" TEXT NOT NULL DEFAULT 'CONTAINS',
  ADD COLUMN IF NOT EXISTS "excludeKnownContacts" BOOLEAN NOT NULL DEFAULT false;
