CREATE INDEX CONCURRENTLY "Newsletter_emailAccountId_lower_email_idx"
ON "Newsletter" ("emailAccountId", LOWER("email"));
