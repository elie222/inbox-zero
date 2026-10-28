ALTER TABLE "MailSplit" ADD COLUMN "values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "MailSplit" SET "values" = ARRAY["value"] WHERE "value" IS NOT NULL;

ALTER TABLE "MailSplit" DROP COLUMN "value";
