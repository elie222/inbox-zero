-- Inline base64 profile photos are replayed in the session cookie and push the
-- request headers past the edge limit, locking those accounts out. Avatars are
-- served from "EmailAccount"."image", so clearing this column is not user visible.
UPDATE "User" SET "image" = NULL WHERE "image" ILIKE 'data:%';
