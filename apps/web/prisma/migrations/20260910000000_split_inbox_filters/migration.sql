-- Splits become a named set of filter conditions instead of a single kind+value,
-- so a split can combine a label with a sender, a category with an age, and so on.

CREATE TYPE "MailSplitFilterKind" AS ENUM ('UNREAD', 'STARRED', 'LABEL', 'CATEGORY', 'FROM', 'OLDER_THAN');

ALTER TABLE "MailSplit" ADD COLUMN "matchAll" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "MailSplitFilter" (
    "id" TEXT NOT NULL,
    "kind" "MailSplitFilterKind" NOT NULL,
    "value" TEXT,
    "order" INTEGER NOT NULL,
    "mailSplitId" TEXT NOT NULL,

    CONSTRAINT "MailSplitFilter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailSplitFilter_mailSplitId_order_key" ON "MailSplitFilter"("mailSplitId", "order");
CREATE INDEX "MailSplitFilter_mailSplitId_idx" ON "MailSplitFilter"("mailSplitId");
CREATE INDEX "MailSplitFilter_kind_value_idx" ON "MailSplitFilter"("kind", "value");

ALTER TABLE "MailSplitFilter" ADD CONSTRAINT "MailSplitFilter_mailSplitId_fkey"
    FOREIGN KEY ("mailSplitId") REFERENCES "MailSplit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing label unions as "match any", and built-in inbox rows as
-- filterless splits. Order and ids remain unchanged.
UPDATE "MailSplit" SET "matchAll" = false WHERE "kind" = 'LABEL' AND cardinality("values") > 1;

INSERT INTO "MailSplitFilter" ("id", "kind", "value", "order", "mailSplitId")
SELECT 'split-filter-' || s."id" || '-' || value.ordinality,
       s."kind"::text::"MailSplitFilterKind", value.value, value.ordinality - 1, s."id"
FROM "MailSplit" s
CROSS JOIN LATERAL unnest(s."values") WITH ORDINALITY AS value(value, ordinality)
WHERE s."kind" IN ('LABEL', 'CATEGORY');

INSERT INTO "MailSplitFilter" ("id", "kind", "value", "order", "mailSplitId")
SELECT 'split-filter-' || "id", 'UNREAD'::"MailSplitFilterKind", NULL, 0, "id"
FROM "MailSplit" WHERE "kind" = 'UNREAD';

ALTER TABLE "MailSplit" DROP COLUMN "kind";
ALTER TABLE "MailSplit" DROP COLUMN "values";
DROP TYPE "MailSplitKind";
