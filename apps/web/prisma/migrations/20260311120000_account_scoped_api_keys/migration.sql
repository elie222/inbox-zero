CREATE TYPE "ApiKeyScope" AS ENUM (
    'STATS_READ',
    'RULES_READ',
    'RULES_WRITE',
    'SETTINGS_READ',
    'SETTINGS_WRITE',
    'ASSISTANT_CHAT'
);

ALTER TABLE "ApiKey"
ADD COLUMN "emailAccountId" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "scopes" "ApiKeyScope"[] DEFAULT ARRAY[]::"ApiKeyScope"[];

CREATE INDEX "ApiKey_emailAccountId_isActive_idx" ON "ApiKey"("emailAccountId", "isActive");

ALTER TABLE "ApiKey"
ADD CONSTRAINT "ApiKey_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId")
REFERENCES "EmailAccount"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
