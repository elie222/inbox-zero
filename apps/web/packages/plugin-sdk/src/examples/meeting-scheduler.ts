/**
 * Meeting Scheduler Capability Example
 *
 * Demonstrates a capability that:
 * - Detects meeting requests and scheduling emails
 * - Extracts meeting details using LLM structured output
 * - Creates calendar events when appropriate
 * - Provides transparent explanations to users
 *
 * Required capabilities: email:classify, calendar:write
 * Required integrations: calendar
 */
import { z } from "zod";
import { defineCapability } from "../helpers/define-capability";
import type { CapabilityContext, CapabilityResult } from "../types/capability";

/**
 * Schema for extracted meeting details
 */
const meetingDetailsSchema = z.object({
  isMeetingRequest: z
    .boolean()
    .describe("Whether this email is about scheduling a meeting"),
  title: z.string().optional().describe("Meeting title/subject"),
  proposedDate: z
    .string()
    .optional()
    .describe("ISO date string of proposed meeting time"),
  duration: z.number().optional().describe("Duration in minutes"),
  location: z.string().optional().describe("Meeting location or video link"),
  attendees: z
    .array(z.string())
    .optional()
    .describe("Email addresses of attendees"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for this extraction"),
  reasoning: z
    .string()
    .describe("Brief explanation of why this is/isn't a meeting request"),
});

type MeetingDetails = z.infer<typeof meetingDetailsSchema>;

/**
 * Meeting Scheduler Capability
 *
 * Handles meeting requests and scheduling emails by:
 * 1. Detecting meeting-related content in emails
 * 2. Extracting structured meeting details via LLM
 * 3. Creating calendar events when details are sufficient
 *
 * @example plugin.json capabilities
 * ```json
 * {
 *   "capabilities": ["email:classify", "calendar:write"]
 * }
 * ```
 */
export const meetingScheduler = defineCapability({
  id: "meeting-scheduler",
  name: "Meeting Scheduler",
  description:
    "Detects meeting requests in emails and creates calendar events. " +
    "Handles scheduling invites, meeting proposals, and calendar-related communications.",

  routingHints: [
    // direct meeting terms
    "meeting",
    "schedule",
    "calendar",
    "invite",
    "appointment",
    // scheduling actions
    "book",
    "reserve",
    "set up a call",
    "find a time",
    "availability",
    // video meeting platforms
    "zoom",
    "teams",
    "google meet",
    "webex",
    // time-related
    "reschedule",
    "postpone",
    "confirm attendance",
  ],

  requires: ["calendar"],

  /**
   * Quick validation before expensive LLM call.
   * Checks for meeting-related keywords in subject/snippet.
   */
  async canHandle(ctx: CapabilityContext): Promise<boolean> {
    const text = `${ctx.email.subject} ${ctx.email.snippet}`.toLowerCase();
    const meetingKeywords = [
      "meeting",
      "schedule",
      "calendar",
      "invite",
      "appointment",
      "call",
      "zoom",
      "teams",
      "meet",
      "availability",
    ];
    return meetingKeywords.some((keyword) => text.includes(keyword));
  },

  /**
   * Process meeting request and optionally create calendar event.
   */
  async execute(ctx: CapabilityContext): Promise<CapabilityResult> {
    const { email, llm, calendar } = ctx;

    // extract meeting details using LLM
    const extraction = await llm.generateObject({
      schema: meetingDetailsSchema,
      prompt: `Analyze this email and extract meeting details if present.

Subject: ${email.subject}
From: ${email.from}
Content: ${email.body || email.snippet}

If this is a meeting request or scheduling email, extract all relevant details.
If not, set isMeetingRequest to false and explain why.`,
      system:
        "You are an expert at identifying meeting requests and extracting scheduling details from emails. " +
        "Be conservative - only identify clear meeting requests, not general mentions of meetings.",
    });

    const details: MeetingDetails = extraction.object;

    // not a meeting request - decline to handle
    if (!details.isMeetingRequest) {
      return {
        handled: false,
        explanation: {
          summary: "Not a meeting request",
          details: details.reasoning,
        },
        confidence: details.confidence,
      };
    }

    // meeting request detected but missing required details
    if (!details.proposedDate || !details.title) {
      return {
        handled: true,
        actions: [
          {
            type: "label",
            params: { labelName: "Meeting Request", threadId: email.threadId },
            executed: true,
          },
        ],
        explanation: {
          summary: "Meeting request detected but needs more details",
          details: `Found a meeting request but couldn't extract complete scheduling info. ${details.reasoning}`,
        },
        confidence: details.confidence,
      };
    }

    // attempt to create calendar event if calendar is available
    if (calendar) {
      try {
        const startDate = new Date(details.proposedDate);
        const endDate = new Date(
          startDate.getTime() + (details.duration || 30) * 60 * 1000,
        );

        await calendar.createEvent({
          summary: details.title,
          description: `Scheduled from email: ${email.subject}\n\nOriginal sender: ${email.from}`,
          start: {
            dateTime: startDate.toISOString(),
            timeZone: "UTC",
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: "UTC",
          },
          location: details.location,
          attendees: details.attendees?.map((email) => ({ email })),
        });

        return {
          handled: true,
          actions: [
            {
              type: "custom",
              params: {
                action: "calendar-event-created",
                title: details.title,
                date: details.proposedDate,
                duration: details.duration,
              },
              executed: true,
            },
            {
              type: "label",
              params: {
                labelName: "Meeting Scheduled",
                threadId: email.threadId,
              },
              executed: true,
            },
          ],
          explanation: {
            summary: `Scheduled: ${details.title}`,
            details: `Created calendar event for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}. Duration: ${details.duration || 30} minutes.`,
          },
          confidence: details.confidence,
        };
      } catch (error) {
        return {
          handled: true,
          actions: [
            {
              type: "custom",
              params: {
                action: "calendar-event-create-failed",
                error: String(error),
              },
              executed: false,
              error: String(error),
            },
          ],
          explanation: {
            summary: "Meeting detected but couldn't create event",
            details: `Found meeting request for "${details.title}" but failed to create calendar event: ${error}`,
          },
          confidence: details.confidence,
        };
      }
    }

    // no calendar access - just label the email
    return {
      handled: true,
      actions: [
        {
          type: "label",
          params: { labelName: "Meeting Request", threadId: email.threadId },
          executed: true,
        },
      ],
      explanation: {
        summary: `Meeting request: ${details.title}`,
        details: `Detected meeting request for ${details.proposedDate}. Calendar integration not available.`,
      },
      confidence: details.confidence,
    };
  },
});

export default meetingScheduler;
