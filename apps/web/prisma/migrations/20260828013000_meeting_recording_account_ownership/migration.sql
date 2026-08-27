ALTER TABLE "MeetingRecording" ADD COLUMN "emailAccountId" TEXT;

UPDATE "MeetingRecording" AS recording
SET "emailAccountId" = owner."emailAccountId"
FROM (
  SELECT "recordingId", MIN("emailAccountId") AS "emailAccountId"
  FROM "Meeting"
  WHERE "recordingId" IS NOT NULL
  GROUP BY "recordingId"
) AS owner
WHERE recording.id = owner."recordingId";

-- These rows are unreachable by any account. Removing them also clears any
-- transcripts that were orphaned by earlier account deletions.
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
