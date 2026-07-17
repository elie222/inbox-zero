CREATE UNIQUE INDEX CONCURRENTLY "Newsletter_emailAccountId_lower_email_key"
ON "Newsletter" ("emailAccountId", LOWER("email"));

DROP INDEX CONCURRENTLY "Newsletter_emailAccountId_lower_email_idx";
