-- Google and iOS address books hold phone-only contacts. email was required
-- and doubles as the contact's identity, so those people could not be stored
-- at all and the Google pull skipped them. Postgres treats NULLs as distinct
-- in a unique index, so Contact_emailAccountId_email_key keeps protecting
-- real addresses.
ALTER TABLE "Contact" ALTER COLUMN "email" DROP NOT NULL;
