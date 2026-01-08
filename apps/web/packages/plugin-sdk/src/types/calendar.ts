/**
 * RSVP response status for a calendar event attendee.
 */
export type AttendeeResponseStatus =
  | "needsAction"
  | "declined"
  | "tentative"
  | "accepted";

/**
 * Status of a calendar event.
 */
export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

/**
 * Represents a calendar available to the user.
 */
export interface Calendar {
  /**
   * Unique identifier for the calendar.
   */
  id: string;
  /**
   * Display name of the calendar.
   */
  name: string;
  /**
   * Whether this is the user's primary calendar.
   */
  primary: boolean;
  /**
   * Optional description of the calendar.
   */
  description?: string;
  /**
   * Whether the user has edit permissions for this calendar.
   */
  canEdit: boolean;
}

/**
 * Represents an attendee of a calendar event, including RSVP status.
 */
export interface CalendarEventAttendee {
  /**
   * Email address of the attendee.
   */
  email: string;
  /**
   * Display name of the attendee.
   */
  name?: string;
  /**
   * The attendee's RSVP response status.
   */
  responseStatus: AttendeeResponseStatus;
  /**
   * Whether this attendee is the event organizer.
   */
  organizer?: boolean;
  /**
   * Whether this attendee is the currently authenticated user.
   */
  self?: boolean;
}

/**
 * Represents an event organizer.
 */
export interface CalendarEventOrganizer {
  /**
   * Email address of the organizer.
   */
  email: string;
  /**
   * Display name of the organizer.
   */
  name?: string;
}

/**
 * Date/time specification for calendar events.
 * Either dateTime (for timed events) or date (for all-day events) should be set.
 */
export interface CalendarDateTime {
  /**
   * ISO 8601 date-time string for timed events.
   * Mutually exclusive with `date`.
   */
  dateTime?: string;
  /**
   * Date string (YYYY-MM-DD) for all-day events.
   * Mutually exclusive with `dateTime`.
   */
  date?: string;
  /**
   * IANA timezone identifier (e.g., 'America/Los_Angeles').
   * Only applicable for timed events (with dateTime).
   */
  timeZone?: string;
}

/**
 * Represents a busy time period when the user is unavailable.
 */
export interface BusyPeriod {
  /**
   * ISO 8601 date-time string for the start of the busy period.
   */
  start: string;
  /**
   * ISO 8601 date-time string for the end of the busy period.
   */
  end: string;
}

/**
 * Represents a calendar event with full details including RSVP tracking.
 */
export interface CalendarEvent {
  /**
   * Unique identifier for the event.
   */
  id: string;
  /**
   * ID of the calendar containing this event.
   */
  calendarId: string;
  /**
   * Title/summary of the event.
   */
  summary: string;
  /**
   * Optional description/notes for the event.
   */
  description?: string;
  /**
   * Event start time.
   */
  start: CalendarDateTime;
  /**
   * Event end time.
   */
  end: CalendarDateTime;
  /**
   * Optional location for the event.
   */
  location?: string;
  /**
   * List of attendees with RSVP status.
   * Use this to track who has responded and their response.
   */
  attendees?: CalendarEventAttendee[];
  /**
   * Event status (confirmed, tentative, or cancelled).
   */
  status?: CalendarEventStatus;
  /**
   * Event organizer information.
   */
  organizer?: CalendarEventOrganizer;
  /**
   * URL to the event in the calendar provider's web interface.
   */
  eventUrl?: string;
  /**
   * Video conference link (Zoom, Google Meet, Teams, etc.) if available.
   */
  videoConferenceLink?: string;
  /**
   * Recurrence rules in RRULE format (RFC 5545).
   * Only present for recurring events.
   * @example ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
   */
  recurrence?: string[];
  /**
   * For recurring event instances, the ID of the recurring event.
   */
  recurringEventId?: string;
}

/**
 * Options for listing calendar events.
 */
export interface ListEventsOptions {
  /**
   * ID of the calendar to query. Defaults to primary calendar.
   */
  calendarId?: string;
  /**
   * Minimum start time for returned events.
   */
  timeMin?: Date;
  /**
   * Maximum start time for returned events.
   */
  timeMax?: Date;
  /**
   * Free text search query to filter events.
   */
  q?: string;
  /**
   * Maximum number of events to return.
   */
  maxResults?: number;
}

/**
 * Options for querying free/busy availability.
 */
export interface GetBusyPeriodsOptions {
  /**
   * Start of the time range to check.
   */
  timeMin: Date;
  /**
   * End of the time range to check.
   */
  timeMax: Date;
  /**
   * Optional list of calendar IDs to check.
   * If not provided, checks all enabled calendars.
   */
  calendarIds?: string[];
}

/**
 * Options for listing events with a specific attendee.
 */
export interface ListEventsWithAttendeeOptions {
  /**
   * Email address of the attendee to filter by.
   */
  attendeeEmail: string;
  /**
   * Start of the time range to search.
   */
  timeMin: Date;
  /**
   * End of the time range to search.
   */
  timeMax: Date;
  /**
   * Maximum number of events to return.
   */
  maxResults?: number;
}

/**
 * Input for creating a new calendar event.
 */
export interface CreateEventInput {
  /**
   * Title/summary of the event.
   */
  summary: string;
  /**
   * Optional description/notes for the event.
   */
  description?: string;
  /**
   * Event start time.
   */
  start: CalendarDateTime;
  /**
   * Event end time.
   */
  end: CalendarDateTime;
  /**
   * Optional location for the event.
   */
  location?: string;
  /**
   * Optional list of attendees to invite.
   * Attendees will receive invitations and their RSVP status will be tracked.
   */
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  /**
   * Recurrence rules in RRULE format (RFC 5545) for recurring events.
   * @example ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
   */
  recurrence?: string[];
}

/**
 * Input for updating an existing calendar event.
 * All fields are optional - only provided fields will be updated.
 */
export interface UpdateEventInput {
  /**
   * Updated title/summary of the event.
   */
  summary?: string;
  /**
   * Updated description/notes for the event.
   */
  description?: string;
  /**
   * Updated event start time.
   */
  start?: CalendarDateTime;
  /**
   * Updated event end time.
   */
  end?: CalendarDateTime;
  /**
   * Updated location for the event.
   */
  location?: string;
  /**
   * Updated list of attendees.
   * This will replace the existing attendee list.
   */
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  /**
   * Updated event status.
   */
  status?: CalendarEventStatus;
  /**
   * Updated recurrence rules. Set to empty array to make non-recurring.
   */
  recurrence?: string[];
}

/**
 * Input for responding to a calendar event invitation.
 */
export interface RespondToEventInput {
  /**
   * The response to send (accept, decline, or tentative).
   */
  response: "accepted" | "declined" | "tentative";
  /**
   * Optional comment to include with the response.
   */
  comment?: string;
  /**
   * Whether to send a response notification to the organizer.
   * Defaults to true.
   */
  sendResponse?: boolean;
}

/**
 * Plugin Calendar interface for reading and writing calendar events.
 *
 * Supports multi-calendar access (Inbox Zero already supports multiple calendars).
 * All methods default to the primary calendar if calendarId is not specified.
 *
 * **Permission Requirements**:
 * - `calendar:list` - Required for `listCalendars()`
 * - `calendar:read` - Required for `listEvents()`, `getEvent()`, `getBusyPeriods()`, `listEventsWithAttendee()`
 * - `calendar:write` - Required for `createEvent()`, `updateEvent()`, `deleteEvent()`, `respondToEvent()`
 *
 * **Trust Level Requirements**:
 * - Read operations: `community` trust level
 * - Write operations: `verified` trust level
 *
 * @example
 * ```typescript
 * // List all available calendars
 * const calendars = await ctx.calendar.listCalendars();
 * const primaryCalendar = calendars.find(c => c.primary);
 *
 * // Get upcoming events for the next 24 hours
 * const events = await ctx.calendar.listEvents({
 *   timeMin: new Date(),
 *   timeMax: addHours(new Date(), 24),
 * });
 *
 * // Check busy periods for scheduling
 * const busyPeriods = await ctx.calendar.getBusyPeriods({
 *   timeMin: new Date(),
 *   timeMax: addDays(new Date(), 7),
 * });
 *
 * // Find meetings with a specific person
 * const meetingsWithContact = await ctx.calendar.listEventsWithAttendee({
 *   attendeeEmail: 'colleague@example.com',
 *   timeMin: subDays(new Date(), 30),
 *   timeMax: addDays(new Date(), 30),
 *   maxResults: 10,
 * });
 *
 * // Check for pending RSVPs
 * for (const event of events) {
 *   const pending = event.attendees?.filter(
 *     a => a.responseStatus === 'needsAction' && !a.self
 *   );
 *   if (pending?.length) {
 *     console.log(`${event.summary} has ${pending.length} pending RSVPs`);
 *   }
 * }
 *
 * // Create a new event with attendees
 * const newEvent = await ctx.calendar.createEvent({
 *   summary: 'Team Standup',
 *   start: { dateTime: '2024-01-15T09:00:00', timeZone: 'America/Los_Angeles' },
 *   end: { dateTime: '2024-01-15T09:30:00', timeZone: 'America/Los_Angeles' },
 *   attendees: [
 *     { email: 'teammate@example.com', name: 'Teammate' },
 *   ],
 * });
 *
 * // Create a recurring event
 * const recurringEvent = await ctx.calendar.createEvent({
 *   summary: 'Weekly Sync',
 *   start: { dateTime: '2024-01-15T10:00:00', timeZone: 'America/Los_Angeles' },
 *   end: { dateTime: '2024-01-15T10:30:00', timeZone: 'America/Los_Angeles' },
 *   recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
 * });
 *
 * // Create an all-day event
 * const allDayEvent = await ctx.calendar.createEvent({
 *   summary: 'Company Holiday',
 *   start: { date: '2024-12-25' },
 *   end: { date: '2024-12-26' },
 * });
 * ```
 */
export interface PluginCalendar {
  /**
   * List all calendars available to the user.
   *
   * @returns Array of Calendar objects
   */
  listCalendars(): Promise<Calendar[]>;

  /**
   * List events matching the specified criteria.
   *
   * @param options - Query options including time range, search query, and calendar ID
   * @returns Array of CalendarEvent objects
   */
  listEvents(options: ListEventsOptions): Promise<CalendarEvent[]>;

  /**
   * Get a specific event by ID.
   *
   * @param eventId - The event ID to retrieve
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   * @returns The CalendarEvent
   * @throws If the event is not found
   */
  getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent>;

  /**
   * Get busy periods (free/busy availability) for the specified time range.
   *
   * Useful for finding available time slots when scheduling meetings.
   * Requires `calendar:read` permission.
   *
   * @param options - Time range and optional calendar IDs to check
   * @returns Array of BusyPeriod objects representing times when the user is busy
   *
   * @example
   * ```typescript
   * // Check availability for the next week
   * const busyPeriods = await ctx.calendar.getBusyPeriods({
   *   timeMin: new Date(),
   *   timeMax: addDays(new Date(), 7),
   * });
   *
   * // Find free 30-minute slots
   * const freeSlots = findFreeSlots(busyPeriods, 30);
   * ```
   */
  getBusyPeriods(options: GetBusyPeriodsOptions): Promise<BusyPeriod[]>;

  /**
   * List events that include a specific attendee.
   *
   * Useful for finding past or upcoming meetings with a specific person,
   * such as when preparing context before responding to their email.
   * Requires `calendar:read` permission.
   *
   * @param options - Attendee email and time range
   * @returns Array of CalendarEvent objects that include the specified attendee
   *
   * @example
   * ```typescript
   * // Find recent meetings with a contact
   * const meetings = await ctx.calendar.listEventsWithAttendee({
   *   attendeeEmail: 'colleague@example.com',
   *   timeMin: subDays(new Date(), 30),
   *   timeMax: new Date(),
   *   maxResults: 5,
   * });
   *
   * // Use meeting context when drafting a reply
   * const recentMeeting = meetings[0];
   * if (recentMeeting) {
   *   console.log(`Last met on ${recentMeeting.start.dateTime}: ${recentMeeting.summary}`);
   * }
   * ```
   */
  listEventsWithAttendee(
    options: ListEventsWithAttendeeOptions,
  ): Promise<CalendarEvent[]>;

  /**
   * Create a new calendar event.
   *
   * Requires `calendar:write` permission and `verified` trust level.
   *
   * @param event - Event details to create
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   * @returns The created CalendarEvent including generated ID
   */
  createEvent(
    event: CreateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent>;

  /**
   * Update an existing calendar event.
   *
   * Requires `calendar:write` permission and `verified` trust level.
   * Only provided fields in the input will be updated.
   *
   * @param eventId - The event ID to update
   * @param event - Fields to update
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   * @returns The updated CalendarEvent
   */
  updateEvent(
    eventId: string,
    event: UpdateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent>;

  /**
   * Delete a calendar event.
   *
   * Requires `calendar:write` permission and `verified` trust level.
   *
   * @param eventId - The event ID to delete
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   */
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;

  /**
   * Respond to a calendar event invitation (RSVP).
   *
   * Requires `calendar:write` permission and `verified` trust level.
   * This allows plugins to accept, decline, or tentatively accept event invitations.
   *
   * @param eventId - The event ID to respond to
   * @param input - The response details (accept/decline/tentative, comment, etc.)
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   *
   * @example
   * ```typescript
   * // Accept an event invitation
   * await ctx.calendar.respondToEvent(event.id, {
   *   response: 'accepted',
   *   comment: 'Looking forward to it!',
   * });
   *
   * // Decline with a reason
   * await ctx.calendar.respondToEvent(event.id, {
   *   response: 'declined',
   *   comment: 'I have a conflict at that time.',
   * });
   *
   * // Tentatively accept
   * await ctx.calendar.respondToEvent(event.id, {
   *   response: 'tentative',
   * });
   * ```
   */
  respondToEvent(
    eventId: string,
    input: RespondToEventInput,
    calendarId?: string,
  ): Promise<void>;
}
