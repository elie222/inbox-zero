import { CALENDAR_IDS } from "./types";

interface ShippingEmailInput {
  from: string;
  subject: string;
}

interface CalendarEventDate {
  date: string;
}

interface ShippingCalendarEvent {
  calendarId: string;
  description: string;
  end: CalendarEventDate;
  start: CalendarEventDate;
  summary: string;
}

type Carrier = "Amazon" | "FedEx" | "UPS" | "USPS" | "DHL";

function detectCarrier(from: string, subject: string): Carrier | null {
  const combined = `${from} ${subject}`.toLowerCase();
  if (combined.includes("amazon")) return "Amazon";
  if (combined.includes("fedex")) return "FedEx";
  if (combined.includes("ups")) return "UPS";
  if (combined.includes("usps")) return "USPS";
  if (combined.includes("dhl")) return "DHL";
  return null;
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : email.toLowerCase();
}

/**
 * Parses a shipping email and returns a human-readable item description
 * suitable for use as a calendar event title.
 */
export function parseShippingEmail(input: ShippingEmailInput): string {
  const { subject, from } = input;
  const carrier = detectCarrier(from, subject);

  // Try to extract item name from subject (e.g. "Your order of X has shipped")
  const itemMatch = subject.match(/order of (.+?) has shipped/i);
  if (itemMatch) {
    return itemMatch[1].trim();
  }

  // For non-Amazon carriers, use "Package (Carrier)"
  if (carrier && carrier !== "Amazon") {
    return `Package (${carrier})`;
  }

  // Fallback: "Order (domain)"
  const domain = extractDomain(from);
  return `Order (${domain})`;
}

/**
 * Builds a Google Calendar all-day event object for a shipping notification.
 */
export function buildShippingCalendarEvent(
  itemDescription: string,
  messageLink: string,
): ShippingCalendarEvent {
  const today = new Date().toISOString().split("T")[0];

  return {
    summary: `Shipping: ${itemDescription}`,
    description: messageLink,
    calendarId: CALENDAR_IDS.personal,
    start: { date: today },
    end: { date: today },
  };
}
