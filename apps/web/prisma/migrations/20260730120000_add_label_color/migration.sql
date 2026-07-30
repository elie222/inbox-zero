-- Folder colour picked in the label settings drawer; null falls back to the
-- name-hashed colour the sidebar has always used
ALTER TABLE "Label" ADD COLUMN "color" TEXT;
