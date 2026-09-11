-- Align stored slotIntervalMinutes with the new fixed 30-minute anchor so
-- existing booking links surface slots inside free windows that don't line
-- up with the call duration (e.g., 10:00 openings for 45-minute calls).
UPDATE "BookingLink"
SET "slotIntervalMinutes" = LEAST("durationMinutes", 30)
WHERE "slotIntervalMinutes" <> LEAST("durationMinutes", 30);
