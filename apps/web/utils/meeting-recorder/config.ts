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
