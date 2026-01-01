import { GmailLabel } from "@/utils/gmail/label";
import type { ParsedMessage } from "@/utils/types";

export type ExpirableCategory =
  | "NOTIFICATION"
  | "NEWSLETTER"
  | "MARKETING"
  | "SOCIAL"
  | "CALENDAR"
  | null;

export const categoryDefaults: Record<
  NonNullable<ExpirableCategory>,
  number
> = {
  NOTIFICATION: 7,
  NEWSLETTER: 30,
  MARKETING: 14,
  SOCIAL: 7,
  CALENDAR: 1,
};

/**
 * Detect if an email should be analyzed for expiration.
 * Returns the category if expirable, null if not.
 */
export function detectExpirableCategory(
  message: ParsedMessage,
): ExpirableCategory {
  const labels = message.labelIds || [];

  // Check Gmail categories
  if (labels.includes(GmailLabel.SOCIAL)) return "SOCIAL";
  if (labels.includes(GmailLabel.PROMOTIONS)) return "MARKETING";
  if (labels.includes(GmailLabel.UPDATES)) return "NOTIFICATION";
  if (labels.includes(GmailLabel.FORUMS)) return "NEWSLETTER";

  // Check for calendar invites (via attachments)
  const hasCalendarAttachment = message.attachments?.some(
    (att) =>
      att.mimeType?.includes("calendar") ||
      att.filename?.endsWith(".ics") ||
      att.filename?.endsWith(".ical"),
  );
  if (hasCalendarAttachment) return "CALENDAR";

  // Check for unsubscribe link (newsletter indicator)
  const listUnsubscribe = message.headers?.["list-unsubscribe"];
  if (listUnsubscribe) return "NEWSLETTER";

  // Could add more heuristics here
  return null;
}

/**
 * Get default expiration days for a category.
 */
export function getDefaultExpirationDays(
  category: ExpirableCategory,
  userSettings?: {
    notificationDays?: number;
    newsletterDays?: number;
    marketingDays?: number;
    socialDays?: number;
    calendarDays?: number;
  },
): number {
  if (!category) return 30; // Fallback default

  // Use user settings if available, otherwise category defaults
  switch (category) {
    case "NOTIFICATION":
      return userSettings?.notificationDays ?? categoryDefaults.NOTIFICATION;
    case "NEWSLETTER":
      return userSettings?.newsletterDays ?? categoryDefaults.NEWSLETTER;
    case "MARKETING":
      return userSettings?.marketingDays ?? categoryDefaults.MARKETING;
    case "SOCIAL":
      return userSettings?.socialDays ?? categoryDefaults.SOCIAL;
    case "CALENDAR":
      return userSettings?.calendarDays ?? categoryDefaults.CALENDAR;
    default:
      return 30;
  }
}
