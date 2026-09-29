export const CALENDAR_INVITATION_LIMITS = {
  attachments: 2,
  content: 256_000,
  encoded: 350_000,
} as const;

// Caps on what the reader renders, kept apart from the ingest gates above:
// these bound the API response instead of rejecting the invitation.
export const CALENDAR_INVITATION_RENDER_LIMITS = {
  attendees: 100,
  text: 2000,
  // Tighter than `text` because up to `attendees` names ship in one response.
  name: 200,
} as const;
