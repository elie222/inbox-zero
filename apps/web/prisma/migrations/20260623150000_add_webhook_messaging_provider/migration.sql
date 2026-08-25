-- AlterEnum
-- Add the WEBHOOK value in its own migration. Postgres cannot use a newly
-- added enum value in the same transaction that adds it, so the column
-- additions live in a separate, later migration.
ALTER TYPE "MessagingProvider" ADD VALUE IF NOT EXISTS 'WEBHOOK';
