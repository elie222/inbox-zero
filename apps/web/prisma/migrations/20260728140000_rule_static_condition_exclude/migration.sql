-- Negate a static condition: the rule matches when the field does NOT match
ALTER TABLE "Rule" ADD COLUMN "fromExclude" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN "toExclude" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN "subjectExclude" BOOLEAN NOT NULL DEFAULT false;
