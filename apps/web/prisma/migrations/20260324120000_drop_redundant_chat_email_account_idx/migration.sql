-- Drop redundant left-prefix index now covered by
-- Chat_emailAccountId_deletedAt_updatedAt_idx
DROP INDEX "Chat_emailAccountId_idx";
