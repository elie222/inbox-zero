import type { PremiumTier } from "@/generated/prisma/enums";

// The tier that entitles an account to the notetaker. Booking a bot is visible
// to everyone on the call and billed per bot, so every layer that could put one
// in a meeting has to agree with the layer that produces the summary.
export const MEETING_RECORDER_MIN_TIER: PremiumTier = "PLUS_MONTHLY";

// The bot has to be booked before the call starts, so the cron looks one
// interval further ahead than the lead time we want.
export const RECONCILE_WINDOW_MINUTES = 35;

// How far ahead the user can see and override individual meetings.
export const MEETING_LOOKAHEAD_HOURS = 48;

export const MAX_EVENTS_PER_PROVIDER = 50;

// Longer than the process route's maxDuration, so a run that is merely slow is
// never picked up or requeued while it is still going.
export const STUCK_PROCESSING_MINUTES = 15;

// Transcribing an hour-long call takes a while, so wait well past the point a
// transcript would normally have arrived before asking for one again. Retrying
// too eagerly risks paying for the same transcript twice.
export const STUCK_TRANSCRIPT_REQUEST_MINUTES = 90;

// Each processing attempt runs the summarization model, so a meeting that fails
// every time has to stop being retried rather than bill forever.
export const MAX_PROCESSING_ATTEMPTS = 5;

// Nothing older than this is worth retrying, and bounding the sweep stops a
// build-up of dead rows from crowding out meetings that are genuinely stuck.
export const PROCESSING_RETRY_WINDOW_HOURS = 48;
