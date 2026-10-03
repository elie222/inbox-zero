CREATE UNIQUE INDEX "EmailDraftResource_id_emailAccountId_key"
  ON "EmailDraftResource"("id", "emailAccountId");

ALTER TABLE "EmailDraftResource"
  DROP CONSTRAINT "EmailDraftResource_canonicalResourceId_fkey";

ALTER TABLE "EmailDraftResource"
  ADD CONSTRAINT "EmailDraftResource_canonicalResourceId_emailAccountId_fkey"
  FOREIGN KEY ("canonicalResourceId", "emailAccountId")
  REFERENCES "EmailDraftResource"("id", "emailAccountId")
  ON DELETE CASCADE ON UPDATE CASCADE;
