BEGIN;

ALTER TABLE "MeetingRecording" ADD COLUMN "emailAccountId" TEXT;

-- Recording ownership is account-scoped in the application. Refuse to guess
-- if historical data violates that invariant, because choosing either account
-- would let one account deletion remove another account's transcript.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Meeting"
    WHERE "recordingId" IS NOT NULL
    GROUP BY "recordingId"
    HAVING COUNT(DISTINCT "emailAccountId") > 1
  ) THEN
    RAISE EXCEPTION 'MeetingRecording ownership is ambiguous across email accounts';
  END IF;
END $$;

UPDATE "MeetingRecording" AS recording
SET "emailAccountId" = meeting."emailAccountId"
FROM "Meeting" AS meeting
WHERE recording.id = meeting."recordingId";

-- An unowned bot whose provider media has not been deleted still carries the
-- only cancellation and cleanup handle. Abort without deleting it so provider
-- reconciliation can finish before this migration is retried.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MeetingRecording"
    WHERE "emailAccountId" IS NULL
      AND "externalBotId" IS NOT NULL
      AND "mediaDeletedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Unowned MeetingRecording rows require provider reconciliation';
  END IF;
END $$;

-- These rows are unreachable by any account. Removing them also clears any
-- transcripts orphaned by earlier account deletions; provider media is already
-- confirmed deleted or no provider bot was ever created.
DELETE FROM "MeetingRecording" WHERE "emailAccountId" IS NULL;

ALTER TABLE "MeetingRecording" ALTER COLUMN "emailAccountId" SET NOT NULL;

CREATE INDEX "MeetingRecording_emailAccountId_idx"
ON "MeetingRecording"("emailAccountId");

ALTER TABLE "MeetingRecording"
ADD CONSTRAINT "MeetingRecording_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_recordingId_fkey";
ALTER TABLE "Meeting"
ADD CONSTRAINT "Meeting_recordingId_fkey"
FOREIGN KEY ("recordingId") REFERENCES "MeetingRecording"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
