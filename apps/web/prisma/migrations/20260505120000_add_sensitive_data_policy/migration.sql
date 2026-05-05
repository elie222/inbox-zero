ALTER TABLE "EmailAccount"
ADD COLUMN "sensitiveDataPolicy" TEXT;

ALTER TABLE "EmailAccount"
ADD CONSTRAINT "EmailAccount_sensitiveDataPolicy_check"
CHECK ("sensitiveDataPolicy" IS NULL OR "sensitiveDataPolicy" IN ('ALLOW', 'REDACT', 'BLOCK'));
