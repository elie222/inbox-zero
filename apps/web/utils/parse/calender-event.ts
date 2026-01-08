import type { ParsedMessage } from "@/utils/types";

interface CalendarEventInfo {
  isCalendarEvent: boolean;
  eventDate?: Date | null;
  eventDateString?: string;
  recurringEvent?: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  eventTitle?: string;
  organizer?: string;
}

export type CalendarEventStatus = {
  isEvent: boolean;
  timing?: "past" | "future";
};

/**
 * Checks if an email is a calendar event and extracts event date information
 * @param email The email to analyze
 * @returns Information about the calendar event
 */
export function analyzeCalendarEvent(email: ParsedMessage): CalendarEventInfo {
  const result: CalendarEventInfo = {
    isCalendarEvent: false,
  };

  // Check subject for calendar event indicators
  const subject = email.headers.subject || "";
  const calendarKeywords = [
    "invitation",
    "calendar",
    "event",
    "meeting",
    "appointment",
    "scheduled",
    "invite",
    "calendar event",
    "reminder",
  ];

  // Check if subject contains calendar keywords
  const hasCalendarSubject = calendarKeywords.some((keyword) =>
    subject.toLowerCase().includes(keyword.toLowerCase()),
  );

  // Check body for calendar event indicators
  const body = email.textHtml || "";

  // Determine if it's a calendar event based on checks
  result.isCalendarEvent = hasCalendarSubject || hasIcsAttachment(email);

  if (result.isCalendarEvent) {
    // Extract event title
    if (
      subject.includes("Updated invitation:") ||
      subject.includes("invitation:") ||
      subject.includes("invite:")
    ) {
      let title = subject
        .replace("Updated invitation:", "")
        .replace("invitation:", "")
        .replace("invite:", "")
        .trim();

      // If there's schedule information after "@", take only the event name
      if (title.includes("@")) {
        title = title.split("@")[0].trim();
      }

      result.eventTitle = title;
    } else {
      result.eventTitle = subject;
    }

    // Extract organizer
    const organizerMatch =
      body.match(
        /Organiser[\s\S]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      ) ||
      body.match(
        /Organizer[\s\S]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      );
    result.organizer = organizerMatch?.[1];

    // Look for date patterns in the body
    result.recurringEvent =
      body.includes("Weekly") ||
      body.includes("RRULE:FREQ=") ||
      body.includes("recurring");

    // Extract dates from common patterns in email body
    const datePatterns = [
      // Pattern for full date with time: "Monday 10 Feb to Monday 3 Mar"
      /(?:from|on)\s+(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\s+(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/i,

      // Pattern for ISO date in iCalendar data: DTSTART, DTEND, etc.
      /DTSTART(?:;TZID=[^:]+)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i,

      // Pattern for datetime strings
      /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})/i,
    ];

    // Try to find date using the patterns
    let dateMatch = null;
    for (const pattern of datePatterns) {
      const match = body.match(pattern);
      if (match) {
        dateMatch = match;
        break;
      }
    }

    // Process iCalendar dates if present
    const dtStartMatch = body.match(
      /DTSTART(?:;TZID=[^:]+)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i,
    );
    if (dtStartMatch) {
      const [_, year, month, day, hour, minute, second] = dtStartMatch;
      result.startDate = new Date(
        Number.parseInt(year),
        Number.parseInt(month) - 1, // JavaScript months are 0-indexed
        Number.parseInt(day),
        Number.parseInt(hour),
        Number.parseInt(minute),
        Number.parseInt(second),
      );

      // Also look for end date
      const dtEndMatch = body.match(
        /DTEND(?:;TZID=[^:]+)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i,
      );
      if (dtEndMatch) {
        const [_, yearEnd, monthEnd, dayEnd, hourEnd, minuteEnd, secondEnd] =
          dtEndMatch;
        result.endDate = new Date(
          Number.parseInt(yearEnd),
          Number.parseInt(monthEnd) - 1,
          Number.parseInt(dayEnd),
          Number.parseInt(hourEnd),
          Number.parseInt(minuteEnd),
          Number.parseInt(secondEnd),
        );
      }

      // Set the event date
      result.eventDate = result.startDate;
      result.eventDateString = result.eventDate.toLocaleString();
    }
    // If we didn't find an iCalendar date but found text description of date
    else if (dateMatch) {
      // For text patterns like "Monday 10 Feb"
      const monthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];

      // This is a simplistic approach - for production code, you'd want more robust parsing
      const day = dateMatch[1];
      const monthText = dateMatch[2].toLowerCase();

      // Determine month number (0-11)
      let month = monthNames.indexOf(monthText) % 12;
      if (month === -1) month = 0; // Default to January if not found

      // Year might not be in the match, use current year as fallback
      const year = dateMatch[3]
        ? Number.parseInt(dateMatch[3])
        : new Date().getFullYear();

      result.eventDate = new Date(year, month, Number.parseInt(day));
      result.eventDateString = `${year}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }

    // Extract date from text patterns if we haven't found it yet
    if (!result.eventDate) {
      // Look for patterns like "Weekly from 16:00 to 17:00 on Monday from Mon 10 Feb to Mon 3 Mar"
      const weeklyPattern =
        /Weekly.*?from.*?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
      const weeklyMatch = body.match(weeklyPattern);

      if (weeklyMatch) {
        const day = Number.parseInt(weeklyMatch[1]);
        const monthText = weeklyMatch[2];
        const monthMap: { [key: string]: number } = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };
        const month = monthMap[monthText] || 0;

        // Assume current year if not specified
        const year = new Date().getFullYear();

        result.eventDate = new Date(year, month, day);
        result.eventDateString = `${year}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      }
    }
  }

  return result;
}

/**
 * Checks if an email has a .ics file attachment.
 * @param email The email to check.
 * @returns True if a .ics attachment is found, false otherwise.
 */
export function hasIcsAttachment(email: ParsedMessage): boolean {
  if (!email.attachments || email.attachments.length === 0) {
    return false;
  }

  return email.attachments.some((attachment) =>
    attachment.filename?.toLowerCase().endsWith(".ics"),
  );
}

export function isCalendarEventInPast(email: ParsedMessage) {
  const calendarEvent = analyzeCalendarEvent(email);

  return (
    calendarEvent.isCalendarEvent &&
    calendarEvent.eventDate &&
    calendarEvent.eventDate < new Date()
  );
}

export function getCalendarEventStatus(
  email: ParsedMessage,
): CalendarEventStatus {
  const calendarEvent = analyzeCalendarEvent(email);

  if (!calendarEvent.isCalendarEvent) {
    return { isEvent: false };
  }

  if (!calendarEvent.eventDate) {
    return { isEvent: true };
  }

  return {
    isEvent: true,
    timing: calendarEvent.eventDate < new Date() ? "past" : "future",
  };
}

/** High-confidence calendar detection for preset rule matching (bypasses AI). */
export function isCalendarInvite(email: ParsedMessage): boolean {
  return (
    hasIcsAttachment(email) ||
    hasCalendarMimeType(email) ||
    hasICalendarContent(email)
  );
}

function hasCalendarMimeType(email: ParsedMessage): boolean {
  if (!email.attachments || email.attachments.length === 0) {
    return false;
  }

  return email.attachments.some(
    (attachment) =>
      attachment.mimeType?.toLowerCase() === "text/calendar" ||
      attachment.headers?.["content-type"]
        ?.toLowerCase()
        .includes("text/calendar"),
  );
}

function hasICalendarContent(email: ParsedMessage): boolean {
  const body = email.textHtml || email.textPlain || "";

  if (!body.includes("BEGIN:VCALENDAR")) {
    return false;
  }

  // Require DTSTART or METHOD to avoid false positives
  return body.includes("DTSTART") || body.includes("METHOD:");
}
