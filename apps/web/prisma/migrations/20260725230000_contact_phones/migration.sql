-- Replace the single phone with labeled numbers (office, mobile, …)
ALTER TABLE "Contact" ADD COLUMN "phones" JSONB NOT NULL DEFAULT '[]';

UPDATE "Contact"
SET "phones" = jsonb_build_array(jsonb_build_object('label', 'Mobile', 'value', "phone"))
WHERE "phone" IS NOT NULL AND btrim("phone") <> '';

ALTER TABLE "Contact" DROP COLUMN "phone";
