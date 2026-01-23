/**
 * Routing Hints Guide
 *
 * Routing hints are keywords that help the capability router determine which
 * capability handler should process an incoming email. Good routing hints
 * improve accuracy and reduce unnecessary LLM calls.
 *
 * This module provides curated categories of common routing hints organized
 * by domain. Use these as a starting point and customize for your use case.
 *
 * @example Using predefined hint categories
 * ```typescript
 * import { defineCapability } from '@inbox-zero/plugin-sdk';
 * import { ROUTING_HINTS } from '@inbox-zero/plugin-sdk/routing-hints';
 *
 * export const scheduler = defineCapability({
 *   id: 'meeting-scheduler',
 *   routingHints: [
 *     ...ROUTING_HINTS.scheduling,
 *     ...ROUTING_HINTS.calendar,
 *     'standup', // custom hint
 *   ],
 *   // ...
 * });
 * ```
 */

// ---------------------------------------------------------------------------
// Scheduling & Meetings
// ---------------------------------------------------------------------------

/**
 * Hints for meeting and scheduling-related emails
 */
export const SCHEDULING_HINTS = [
  // direct meeting terms
  "meeting",
  "schedule",
  "appointment",
  "book",
  "reserve",
  // scheduling actions
  "find a time",
  "set up a call",
  "availability",
  "free time",
  "calendar invite",
  // meeting types
  "standup",
  "sync",
  "one-on-one",
  "1:1",
  "interview",
  "demo",
  "call",
  "conference",
  // rescheduling
  "reschedule",
  "postpone",
  "cancel meeting",
  "move meeting",
] as const;

/**
 * Hints for calendar-related content
 */
export const CALENDAR_HINTS = [
  "calendar",
  "invite",
  "rsvp",
  "confirm attendance",
  "accept",
  "decline",
  "tentative",
  "event",
  "reminder",
] as const;

/**
 * Hints for video conferencing platforms
 */
export const VIDEO_PLATFORM_HINTS = [
  "zoom",
  "google meet",
  "teams",
  "webex",
  "skype",
  "hangout",
  "video call",
  "join link",
] as const;

// ---------------------------------------------------------------------------
// Commerce & Transactions
// ---------------------------------------------------------------------------

/**
 * Hints for receipts and order confirmations
 */
export const RECEIPT_HINTS = [
  // transaction terms
  "receipt",
  "order confirmation",
  "purchase",
  "invoice",
  "payment received",
  "transaction",
  // order identifiers
  "order #",
  "order number",
  "confirmation number",
  // pricing terms
  "total:",
  "subtotal",
  "amount charged",
  "payment of",
  // status updates
  "shipped",
  "delivery",
  "tracking",
  "out for delivery",
] as const;

/**
 * Hints for subscription and billing emails
 */
export const SUBSCRIPTION_HINTS = [
  "subscription",
  "renewal",
  "monthly charge",
  "annual payment",
  "billing",
  "payment due",
  "invoice",
  "plan upgrade",
  "plan downgrade",
  "trial ending",
  "auto-renew",
] as const;

/**
 * Hints for shipping and delivery updates
 */
export const SHIPPING_HINTS = [
  "shipped",
  "shipping confirmation",
  "tracking number",
  "delivery",
  "out for delivery",
  "delivered",
  "package",
  "carrier",
  "estimated arrival",
  "in transit",
] as const;

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

/**
 * Hints for flight confirmations and updates
 */
export const FLIGHT_HINTS = [
  "flight",
  "airline",
  "boarding pass",
  "e-ticket",
  "departure",
  "arrival",
  "check-in",
  "gate",
  "seat assignment",
  "flight status",
  "delay",
  "cancelled flight",
] as const;

/**
 * Hints for hotel and accommodation
 */
export const HOTEL_HINTS = [
  "hotel",
  "reservation",
  "check-in",
  "check-out",
  "room",
  "accommodation",
  "booking confirmation",
  "guest",
  "stay",
  "airbnb",
  "vrbo",
] as const;

/**
 * Hints for car rental and ground transportation
 */
export const RENTAL_HINTS = [
  "car rental",
  "rental confirmation",
  "pickup",
  "return",
  "vehicle",
  "rental agreement",
  "uber",
  "lyft",
  "ride",
] as const;

/**
 * General travel hints
 */
export const TRAVEL_HINTS = [
  "itinerary",
  "travel",
  "trip",
  "vacation",
  "destination",
  "passport",
  "visa",
] as const;

// ---------------------------------------------------------------------------
// Communication & Follow-up
// ---------------------------------------------------------------------------

/**
 * Hints for emails requiring response or action
 */
export const FOLLOWUP_HINTS = [
  // explicit requests
  "follow up",
  "following up",
  "please respond",
  "awaiting your response",
  "get back to me",
  "your reply",
  // deadlines
  "by end of day",
  "by eod",
  "deadline",
  "due date",
  "urgent",
  "asap",
  "time-sensitive",
  // action requests
  "please confirm",
  "let me know",
  "your thoughts",
  "your feedback",
  "approval needed",
  "decision required",
  "action required",
  // questions
  "can you",
  "could you",
  "would you",
] as const;

/**
 * Hints for newsletters and marketing
 */
export const NEWSLETTER_HINTS = [
  // newsletter indicators
  "newsletter",
  "weekly digest",
  "daily digest",
  "mailing list",
  "bulletin",
  "roundup",
  // marketing
  "promotional",
  "special offer",
  "limited time",
  "exclusive deal",
  "discount",
  "sale",
  // list management
  "unsubscribe",
  "email preferences",
  "manage subscriptions",
  "update preferences",
  "view in browser",
] as const;

// ---------------------------------------------------------------------------
// Support & Service
// ---------------------------------------------------------------------------

/**
 * Hints for customer support communications
 */
export const SUPPORT_HINTS = [
  "support",
  "ticket",
  "case number",
  "help desk",
  "customer service",
  "issue",
  "problem",
  "resolved",
  "feedback",
  "survey",
] as const;

/**
 * Hints for security and account notifications
 */
export const SECURITY_HINTS = [
  "security alert",
  "password",
  "login",
  "sign in",
  "verification",
  "two-factor",
  "2fa",
  "suspicious activity",
  "account locked",
  "reset password",
] as const;

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

/**
 * Hints for banking and financial notifications
 */
export const BANKING_HINTS = [
  "bank",
  "account balance",
  "statement",
  "deposit",
  "withdrawal",
  "transfer",
  "wire",
  "ach",
  "direct deposit",
  "overdraft",
] as const;

/**
 * Hints for investment and trading
 */
export const INVESTMENT_HINTS = [
  "investment",
  "portfolio",
  "stock",
  "dividend",
  "trade confirmation",
  "market",
  "401k",
  "ira",
  "brokerage",
] as const;

// ---------------------------------------------------------------------------
// Work & Professional
// ---------------------------------------------------------------------------

/**
 * Hints for job and recruiting communications
 */
export const RECRUITING_HINTS = [
  "job",
  "application",
  "interview",
  "offer",
  "candidate",
  "resume",
  "position",
  "hiring",
  "recruiter",
  "linkedin",
] as const;

/**
 * Hints for document sharing and collaboration
 */
export const DOCUMENT_HINTS = [
  "shared",
  "document",
  "file",
  "attachment",
  "google docs",
  "dropbox",
  "onedrive",
  "comment",
  "review",
  "approve",
] as const;

/**
 * Hints for project management notifications
 */
export const PROJECT_HINTS = [
  "assigned",
  "task",
  "project",
  "sprint",
  "milestone",
  "deadline",
  "jira",
  "asana",
  "trello",
  "notion",
  "linear",
] as const;

// ---------------------------------------------------------------------------
// Sender Patterns
// ---------------------------------------------------------------------------

/**
 * Common sender address patterns indicating automated/system emails
 */
export const AUTOMATED_SENDER_PATTERNS = [
  "noreply",
  "no-reply",
  "donotreply",
  "notifications@",
  "alerts@",
  "updates@",
  "info@",
  "support@",
  "billing@",
  "orders@",
  "receipts@",
  "newsletter@",
  "news@",
] as const;

// ---------------------------------------------------------------------------
// Combined Categories
// ---------------------------------------------------------------------------

/**
 * All routing hints organized by category.
 * Import and spread these into your capability's routingHints array.
 *
 * @example
 * ```typescript
 * import { ROUTING_HINTS } from '@inbox-zero/plugin-sdk/routing-hints';
 *
 * const myCapability = defineCapability({
 *   routingHints: [
 *     ...ROUTING_HINTS.scheduling,
 *     ...ROUTING_HINTS.videoPlatforms,
 *     'custom-hint',
 *   ],
 * });
 * ```
 */
export const ROUTING_HINTS = {
  // scheduling & meetings
  scheduling: SCHEDULING_HINTS,
  calendar: CALENDAR_HINTS,
  videoPlatforms: VIDEO_PLATFORM_HINTS,

  // commerce & transactions
  receipts: RECEIPT_HINTS,
  subscriptions: SUBSCRIPTION_HINTS,
  shipping: SHIPPING_HINTS,

  // travel
  flights: FLIGHT_HINTS,
  hotels: HOTEL_HINTS,
  rentals: RENTAL_HINTS,
  travel: TRAVEL_HINTS,

  // communication
  followup: FOLLOWUP_HINTS,
  newsletters: NEWSLETTER_HINTS,

  // support & service
  support: SUPPORT_HINTS,
  security: SECURITY_HINTS,

  // finance
  banking: BANKING_HINTS,
  investments: INVESTMENT_HINTS,

  // work & professional
  recruiting: RECRUITING_HINTS,
  documents: DOCUMENT_HINTS,
  projects: PROJECT_HINTS,

  // sender patterns
  automatedSenders: AUTOMATED_SENDER_PATTERNS,
} as const;

// ---------------------------------------------------------------------------
// Best Practices Documentation
// ---------------------------------------------------------------------------

/**
 * ## Routing Hints Best Practices
 *
 * ### 1. Be Specific but Not Too Narrow
 *
 * Good hints are specific enough to avoid false positives but broad enough
 * to catch variations:
 *
 * ```typescript
 * // Good: catches "meeting", "meetings", "meeting request"
 * routingHints: ['meeting', 'schedule', 'calendar']
 *
 * // Too narrow: misses common variations
 * routingHints: ['meeting request', 'schedule a meeting']
 *
 * // Too broad: many false positives
 * routingHints: ['time', 'date', 'when']
 * ```
 *
 * ### 2. Include Domain-Specific Terms
 *
 * Add terms specific to your capability's domain:
 *
 * ```typescript
 * // For a CRM integration
 * routingHints: ['salesforce', 'hubspot', 'lead', 'opportunity', 'deal']
 *
 * // For a project management integration
 * routingHints: ['jira', 'sprint', 'backlog', 'story points']
 * ```
 *
 * ### 3. Include Common Sender Patterns
 *
 * Many automated emails follow predictable sender patterns:
 *
 * ```typescript
 * routingHints: [
 *   'receipt',
 *   'order',
 *   // Sender patterns that indicate receipts
 *   'noreply',
 *   'orders@',
 *   'receipts@',
 * ]
 * ```
 *
 * ### 4. Use canHandle() for Complex Logic
 *
 * Routing hints are for quick filtering. Use `canHandle()` for complex validation:
 *
 * ```typescript
 * const capability = defineCapability({
 *   routingHints: ['flight', 'airline', 'boarding'],
 *
 *   async canHandle(ctx) {
 *     // More sophisticated check
 *     const hasFlightNumber = /[A-Z]{2}\d{3,4}/.test(ctx.email.subject);
 *     const hasKnownAirline = AIRLINE_DOMAINS.some(d =>
 *       ctx.email.from.includes(d)
 *     );
 *     return hasFlightNumber || hasKnownAirline;
 *   },
 * });
 * ```
 *
 * ### 5. Avoid Overlapping with Other Capabilities
 *
 * If multiple capabilities have similar hints, make them more specific:
 *
 * ```typescript
 * // Instead of both using 'calendar'
 * meetingScheduler.routingHints = ['meeting', 'schedule meeting', 'book time']
 * calendarReminder.routingHints = ['reminder', 'upcoming event', 'starts in']
 * ```
 *
 * ### 6. Test with Real Email Data
 *
 * The best hints come from analyzing real emails in your target domain.
 * Look for:
 * - Subject line patterns
 * - Common phrases in the body
 * - Sender address patterns
 * - Header values (List-Unsubscribe, etc.)
 */
export type RoutingHintsBestPractices = never; // documentation only

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type SchedulingHint = (typeof SCHEDULING_HINTS)[number];
export type CalendarHint = (typeof CALENDAR_HINTS)[number];
export type VideoPlatformHint = (typeof VIDEO_PLATFORM_HINTS)[number];
export type ReceiptHint = (typeof RECEIPT_HINTS)[number];
export type SubscriptionHint = (typeof SUBSCRIPTION_HINTS)[number];
export type ShippingHint = (typeof SHIPPING_HINTS)[number];
export type FlightHint = (typeof FLIGHT_HINTS)[number];
export type HotelHint = (typeof HOTEL_HINTS)[number];
export type RentalHint = (typeof RENTAL_HINTS)[number];
export type TravelHint = (typeof TRAVEL_HINTS)[number];
export type FollowupHint = (typeof FOLLOWUP_HINTS)[number];
export type NewsletterHint = (typeof NEWSLETTER_HINTS)[number];
export type SupportHint = (typeof SUPPORT_HINTS)[number];
export type SecurityHint = (typeof SECURITY_HINTS)[number];
export type BankingHint = (typeof BANKING_HINTS)[number];
export type InvestmentHint = (typeof INVESTMENT_HINTS)[number];
export type RecruitingHint = (typeof RECRUITING_HINTS)[number];
export type DocumentHint = (typeof DOCUMENT_HINTS)[number];
export type ProjectHint = (typeof PROJECT_HINTS)[number];
export type AutomatedSenderPattern = (typeof AUTOMATED_SENDER_PATTERNS)[number];
