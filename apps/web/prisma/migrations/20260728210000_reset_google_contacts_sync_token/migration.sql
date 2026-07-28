-- Google contact pulls used to drop anyone without an email address, and the
-- pull still advanced its sync token. An incremental sync only replays what
-- changed since that token, so those people (phone-only contacts) stay
-- invisible forever — Google has no reason to send them again.
--
-- Clearing the token makes the next pull a full one, which picks them up.
-- Nothing else is lost: the token is a resume marker, not data.
UPDATE "EmailAccount"
SET "googleContactsSyncToken" = NULL
WHERE "googleContactsSyncToken" IS NOT NULL;
