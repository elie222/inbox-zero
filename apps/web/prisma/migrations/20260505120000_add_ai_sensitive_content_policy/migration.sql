ALTER TABLE "EmailAccount"
ADD COLUMN "aiSensitiveContentPolicy" TEXT;

ALTER TABLE "EmailAccount"
ADD CONSTRAINT "EmailAccount_aiSensitiveContentPolicy_check"
CHECK ("aiSensitiveContentPolicy" IS NULL OR "aiSensitiveContentPolicy" IN ('ALLOW', 'REDACT', 'BLOCK'));
