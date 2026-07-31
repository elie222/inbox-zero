-- A failed notetaker attempt is normally useful meeting history, but these
-- outcomes mean there was no meeting to show in the Recorded section.
UPDATE "MeetingRecording"
SET "status" = 'CANCELLED'
WHERE "status" = 'FAILED'
  AND "failureReason" IN (
    'The meeting never started.',
    'The notetaker was the only participant, so it left the call.'
  );
