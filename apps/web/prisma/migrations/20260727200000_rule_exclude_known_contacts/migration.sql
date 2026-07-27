-- Rules can opt out of matching senders who are in the contact list
ALTER TABLE "Rule" ADD COLUMN "excludeKnownContacts" BOOLEAN NOT NULL DEFAULT false;

-- Known contacts should never be classified as cold email
UPDATE "Rule" SET "excludeKnownContacts" = true WHERE "systemType" = 'COLD_EMAIL';
