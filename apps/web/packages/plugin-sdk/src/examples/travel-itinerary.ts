/**
 * Travel Itinerary Capability Example
 *
 * Demonstrates a capability that:
 * - Identifies travel confirmations (flights, hotels, car rentals)
 * - Extracts structured travel data
 * - Creates calendar events for travel segments
 * - Organizes travel emails by trip
 *
 * Required capabilities: email:classify, email:modify, calendar:write
 */
import { z } from "zod";
import { defineCapability } from "../helpers/define-capability";
import type { CapabilityContext, CapabilityResult } from "../types/capability";

/**
 * Schema for travel segment
 */
const travelSegmentSchema = z.object({
  type: z.enum(["flight", "hotel", "car-rental", "train", "cruise", "other"]),
  provider: z.string().describe("Airline, hotel chain, or rental company"),
  confirmationNumber: z.string().optional(),
  startDateTime: z.string().describe("Start date/time in ISO format"),
  endDateTime: z.string().optional().describe("End date/time in ISO format"),
  origin: z
    .string()
    .optional()
    .describe("Origin city/airport for flights/trains"),
  destination: z.string().optional().describe("Destination city/airport"),
  details: z
    .string()
    .optional()
    .describe("Additional details like flight number, room type"),
});

/**
 * Schema for travel itinerary extraction
 */
const travelItinerarySchema = z.object({
  isTravelEmail: z
    .boolean()
    .describe("Whether this is a travel confirmation or itinerary"),
  tripName: z
    .string()
    .optional()
    .describe("Suggested trip name based on destination"),
  segments: z
    .array(travelSegmentSchema)
    .describe("Travel segments in chronological order"),
  totalCost: z.number().optional().describe("Total cost if available"),
  currency: z.string().optional().describe("Currency code"),
  travelers: z.array(z.string()).optional().describe("Names of travelers"),
  notes: z.string().optional().describe("Important notes or restrictions"),
  confidence: z.number().min(0).max(1),
});

type TravelItinerary = z.infer<typeof travelItinerarySchema>;

/**
 * Travel Itinerary Capability
 *
 * Processes travel confirmations by:
 * 1. Identifying flight, hotel, and rental car confirmations
 * 2. Extracting structured travel data
 * 3. Creating calendar events for each travel segment
 * 4. Organizing emails by trip destination
 *
 * @example plugin.json capabilities
 * ```json
 * {
 *   "capabilities": ["email:classify", "email:modify", "calendar:write"]
 * }
 * ```
 */
export const travelItinerary = defineCapability({
  id: "travel-itinerary",
  name: "Travel Itinerary",
  description:
    "Processes travel confirmations including flights, hotels, and car rentals. " +
    "Creates calendar events and organizes travel-related emails by trip.",

  routingHints: [
    // booking terms
    "confirmation",
    "itinerary",
    "booking",
    "reservation",
    "e-ticket",
    // flight terms
    "flight",
    "departure",
    "arrival",
    "boarding pass",
    "airline",
    "check-in",
    // hotel terms
    "hotel",
    "check-in",
    "check-out",
    "reservation",
    "room",
    "accommodation",
    // rental terms
    "car rental",
    "pickup",
    "return",
    // travel brands
    "expedia",
    "booking.com",
    "airbnb",
    "kayak",
    "tripadvisor",
  ],

  requires: ["calendar"],

  /**
   * Quick check for travel email patterns
   */
  async canHandle(ctx: CapabilityContext): Promise<boolean> {
    const { subject, from, snippet } = ctx.email;
    const text = `${subject} ${from} ${snippet}`.toLowerCase();

    // common travel sender domains
    const travelDomains = [
      "expedia",
      "booking.com",
      "airbnb",
      "kayak",
      "tripadvisor",
      "hotels.com",
      "united",
      "delta",
      "american",
      "southwest",
      "jetblue",
      "marriott",
      "hilton",
      "hertz",
      "enterprise",
      "avis",
    ];
    const hasTravelSender = travelDomains.some((d) =>
      from.toLowerCase().includes(d),
    );

    // travel content patterns
    const travelPatterns = [
      "flight",
      "itinerary",
      "confirmation",
      "booking",
      "reservation",
      "check-in",
      "departure",
      "arrival",
      "hotel",
      "rental",
    ];
    const hasTravelContent = travelPatterns.some((p) => text.includes(p));

    return hasTravelSender || hasTravelContent;
  },

  /**
   * Extract travel details and create calendar events
   */
  async execute(ctx: CapabilityContext): Promise<CapabilityResult> {
    const { email, llm, storage, emailOperations, calendar } = ctx;

    // extract travel itinerary
    const extraction = await llm.generateObject({
      schema: travelItinerarySchema,
      prompt: `Analyze this email for travel booking or itinerary information.

Subject: ${email.subject}
From: ${email.from}
Content: ${email.body || email.snippet}

Extract all travel segments (flights, hotels, car rentals, trains, etc.).
Include confirmation numbers, dates/times, locations, and any important details.
If this is not a travel confirmation, set isTravelEmail to false.`,
      system:
        "You are an expert at extracting travel itinerary information from confirmation emails. " +
        "Be thorough in extracting dates, times, confirmation numbers, and locations. " +
        "Parse various travel email formats from different providers.",
    });

    const data: TravelItinerary = extraction.object;

    // not a travel email
    if (!data.isTravelEmail || data.segments.length === 0) {
      return {
        handled: false,
        explanation: {
          summary: "Not a travel confirmation",
          details:
            "Email does not appear to contain travel booking information.",
        },
        confidence: data.confidence,
      };
    }

    const actions: CapabilityResult["actions"] = [];

    // store travel data for trip aggregation
    const tripKey = `travel-${data.tripName?.toLowerCase().replace(/\s+/g, "-") || "trip"}-${email.id}`;
    await storage.set(tripKey, {
      emailId: email.id,
      threadId: email.threadId,
      tripName: data.tripName,
      segments: data.segments,
      totalCost: data.totalCost,
      currency: data.currency,
      travelers: data.travelers,
      extractedAt: new Date().toISOString(),
    });

    actions.push({
      type: "custom",
      params: { action: "stored-travel-data", key: tripKey },
      executed: true,
    });

    // create calendar events for each segment
    if (calendar) {
      for (const segment of data.segments) {
        try {
          const startDate = new Date(segment.startDateTime);
          const endDate = segment.endDateTime
            ? new Date(segment.endDateTime)
            : // default durations by type
              new Date(
                startDate.getTime() +
                  (segment.type === "flight"
                    ? 3 * 60 * 60 * 1000 // 3 hours for flights
                    : segment.type === "hotel"
                      ? 24 * 60 * 60 * 1000 // 1 day for hotels
                      : 2 * 60 * 60 * 1000), // 2 hours default
              );

          const eventTitle = buildEventTitle(segment);
          const eventDescription = buildEventDescription(segment, data);

          await calendar.createEvent({
            summary: eventTitle,
            description: eventDescription,
            start: { dateTime: startDate.toISOString(), timeZone: "UTC" },
            end: { dateTime: endDate.toISOString(), timeZone: "UTC" },
            location: segment.destination || segment.origin,
          });

          actions.push({
            type: "custom",
            params: {
              action: "created-calendar-event",
              type: segment.type,
              title: eventTitle,
              date: segment.startDateTime,
            },
            executed: true,
          });
        } catch (error) {
          actions.push({
            type: "custom",
            params: { action: "create-event-failed", type: segment.type },
            executed: false,
            error: String(error),
          });
        }
      }
    }

    // apply labels if available
    if (emailOperations && email.threadId) {
      try {
        // main travel label
        await emailOperations.applyLabel(email.threadId, "Travel");
        actions.push({
          type: "label",
          params: { labelName: "Travel", threadId: email.threadId },
          executed: true,
        });

        // trip-specific label if we have a destination
        if (data.tripName) {
          const tripLabel = `Travel/${data.tripName}`;
          await emailOperations.applyLabel(email.threadId, tripLabel);
          actions.push({
            type: "label",
            params: { labelName: tripLabel, threadId: email.threadId },
            executed: true,
          });
        }

        // type-specific labels
        const types = [...new Set(data.segments.map((s) => s.type))];
        for (const type of types) {
          const typeLabels: Record<string, string> = {
            flight: "Travel/Flights",
            hotel: "Travel/Hotels",
            "car-rental": "Travel/Car Rentals",
            train: "Travel/Rail",
          };
          const typeLabel = typeLabels[type];
          if (typeLabel) {
            await emailOperations.applyLabel(email.threadId, typeLabel);
            actions.push({
              type: "label",
              params: { labelName: typeLabel, threadId: email.threadId },
              executed: true,
            });
          }
        }
      } catch (error) {
        actions.push({
          type: "label",
          params: { labelName: "Travel" },
          executed: false,
          error: String(error),
        });
      }
    }

    // build summary
    const segmentSummary = data.segments
      .map((s) => {
        if (s.type === "flight") {
          return `${s.provider} ${s.origin} → ${s.destination}`;
        } else if (s.type === "hotel") {
          return `${s.provider} in ${s.destination || "N/A"}`;
        } else if (s.type === "car-rental") {
          return `${s.provider} rental`;
        }
        return `${s.type}: ${s.provider}`;
      })
      .join(", ");

    const summary = data.tripName
      ? `${data.tripName}: ${segmentSummary}`
      : segmentSummary;

    const details = [
      `${data.segments.length} segment(s)`,
      data.totalCost
        ? `Total: ${data.currency || "$"}${data.totalCost.toFixed(2)}`
        : null,
      data.travelers?.length ? `Travelers: ${data.travelers.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      handled: true,
      actions,
      explanation: {
        summary:
          summary.substring(0, 100) + (summary.length > 100 ? "..." : ""),
        details,
      },
      confidence: data.confidence,
    };
  },
});

/**
 * Build a descriptive calendar event title
 */
function buildEventTitle(segment: z.infer<typeof travelSegmentSchema>): string {
  switch (segment.type) {
    case "flight":
      return `✈️ ${segment.provider}: ${segment.origin || "?"} → ${segment.destination || "?"}`;
    case "hotel":
      return `🏨 ${segment.provider}${segment.destination ? ` - ${segment.destination}` : ""}`;
    case "car-rental":
      return `🚗 ${segment.provider} Rental`;
    case "train":
      return `🚆 ${segment.provider}: ${segment.origin || "?"} → ${segment.destination || "?"}`;
    default:
      return `${segment.type}: ${segment.provider}`;
  }
}

/**
 * Build calendar event description with all details
 */
function buildEventDescription(
  segment: z.infer<typeof travelSegmentSchema>,
  itinerary: TravelItinerary,
): string {
  const lines: string[] = [];

  if (segment.confirmationNumber) {
    lines.push(`Confirmation: ${segment.confirmationNumber}`);
  }
  if (segment.details) {
    lines.push(segment.details);
  }
  if (itinerary.travelers?.length) {
    lines.push(`Travelers: ${itinerary.travelers.join(", ")}`);
  }
  if (itinerary.notes) {
    lines.push(`\nNotes: ${itinerary.notes}`);
  }

  return lines.join("\n");
}

export default travelItinerary;
