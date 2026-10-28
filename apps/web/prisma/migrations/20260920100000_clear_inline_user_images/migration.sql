-- Inline photos are replayed in the session cookie and lock those accounts out.
-- Avatars come from "EmailAccount"."image", so this is not user visible.
UPDATE "User" SET "image" = NULL WHERE "image" ILIKE 'data:%';
