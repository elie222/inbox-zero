// Anchor available slots to every 30 minutes so that free windows on the
// :00/:30 grid are surfaced even when they don't line up with the call
// duration (e.g., 45-minute calls would otherwise step 9:00, 9:45, 10:30 and
// hide a 10:00-11:00 opening).
const SLOT_ANCHOR_MINUTES = 30;

export function getSlotIntervalMinutes(durationMinutes: number) {
  return Math.min(durationMinutes, SLOT_ANCHOR_MINUTES);
}
