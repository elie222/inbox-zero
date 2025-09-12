// Google Calendar scopes for calendar integration
// Based on https://docs.recall.ai/docs/calendar-v1-google-calendar

export const CALENDAR_SCOPES = [
  // Read calendar events
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // Read and write calendar events (for modifying meetings)
  "https://www.googleapis.com/auth/calendar.events",
  // Read calendar metadata
  "https://www.googleapis.com/auth/calendar.readonly",
  // Read and write calendar metadata (for creating/updating calendars)
  "https://www.googleapis.com/auth/calendar",
  // User info for identification
  "https://www.googleapis.com/auth/userinfo.email",
];

// Additional scopes for advanced calendar features
export const ADVANCED_CALENDAR_SCOPES = [
  // For joining meetings (if needed for specific calendar events)
  "https://www.googleapis.com/auth/calendar.events.owned",
  // For managing calendar settings
  "https://www.googleapis.com/auth/calendar.settings.readonly",
];
