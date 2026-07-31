-- A failed notetaker attempt is normally useful meeting history, but these
-- outcomes mean there was no meeting to show in the Recorded section.
-- activeKey should already be null on terminal rows, but rows written before
-- that invariant existed may still hold their dedup slot; release it here so
-- the same meeting can be booked again.
UPDATE "MeetingRecording"
SET "status" = 'CANCELLED',
    "activeKey" = NULL
WHERE "status" = 'FAILED'
  AND "failureReason" IN (
    'The meeting never started.',
    'The notetaker was the only participant, so it left the call.'
  );
