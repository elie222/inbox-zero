/**
 * Follow-up Tracker Capability Example
 *
 * Demonstrates a capability that:
 * - Detects emails requiring follow-up or response
 * - Extracts deadlines and action items
 * - Creates reminders for pending responses
 * - Tracks follow-up status across conversations
 *
 * Required capabilities: followup:detect, email:modify, calendar:write
 */
import { z } from "zod";
import { defineCapability } from "../helpers/define-capability";
import type { CapabilityContext, CapabilityResult } from "../types/capability";

/**
 * Schema for follow-up detection
 */
const followUpAnalysisSchema = z.object({
  needsFollowUp: z
    .boolean()
    .describe("Whether this email needs follow-up action"),
  urgency: z
    .enum(["urgent", "normal", "low"])
    .describe("Urgency level of the follow-up"),
  actionRequired: z
    .enum([
      "reply-required", // explicit reply requested
      "decision-needed", // decision or approval needed
      "task-assigned", // task or action item assigned
      "information-requested", // information or document requested
      "meeting-response", // RSVP or meeting confirmation needed
      "follow-up-check", // should follow up if no response
      "none",
    ])
    .describe("Type of action required"),
  deadline: z
    .string()
    .optional()
    .describe("Due date in ISO format if mentioned"),
  suggestedFollowUpDate: z
    .string()
    .optional()
    .describe("Suggested follow-up date if no explicit deadline"),
  actionItems: z
    .array(
      z.object({
        task: z.string(),
        dueDate: z.string().optional(),
      }),
    )
    .optional()
    .describe("Specific action items extracted"),
  stakeholders: z
    .array(z.string())
    .optional()
    .describe("People involved in the follow-up"),
  context: z.string().describe("Brief context about why follow-up is needed"),
  confidence: z.number().min(0).max(1),
});

type FollowUpAnalysis = z.infer<typeof followUpAnalysisSchema>;

/**
 * Follow-up Tracker Capability
 *
 * Tracks follow-up needs by:
 * 1. Detecting emails requiring response or action
 * 2. Extracting deadlines and action items
 * 3. Creating calendar reminders for follow-ups
 * 4. Labeling emails for follow-up tracking
 *
 * @example plugin.json capabilities
 * ```json
 * {
 *   "capabilities": ["followup:detect", "email:modify", "calendar:write"]
 * }
 * ```
 */
export const followUpTracker = defineCapability({
  id: "follow-up-tracker",
  name: "Follow-up Tracker",
  description:
    "Detects emails needing follow-up, extracts deadlines and action items, " +
    "and creates reminders. Tracks response requirements and pending conversations.",

  routingHints: [
    // explicit follow-up requests
    "follow up",
    "following up",
    "please respond",
    "awaiting your response",
    "get back to me",
    // deadline indicators
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
    // question indicators
    "can you",
    "could you",
    "would you",
    "?",
  ],

  /**
   * Quick check for follow-up indicators
   */
  async canHandle(ctx: CapabilityContext): Promise<boolean> {
    const { subject, snippet } = ctx.email;
    const text = `${subject} ${snippet}`.toLowerCase();

    // check for explicit follow-up patterns
    const patterns = [
      "follow up",
      "please respond",
      "let me know",
      "your thoughts",
      "awaiting",
      "deadline",
      "urgent",
      "asap",
      "by eod",
      "get back",
      "?", // questions often need response
    ];

    return patterns.some((p) => text.includes(p));
  },

  /**
   * Analyze email for follow-up needs
   */
  async execute(ctx: CapabilityContext): Promise<CapabilityResult> {
    const { email, llm, storage, emailOperations, calendar } = ctx;

    // analyze for follow-up needs
    const analysis = await llm.generateObject({
      schema: followUpAnalysisSchema,
      prompt: `Analyze this email to determine if it requires follow-up action.

Subject: ${email.subject}
From: ${email.from}
Content: ${email.body || email.snippet}

Identify:
1. Whether the sender is expecting a response or action
2. Any explicit or implicit deadlines
3. Specific action items or tasks assigned
4. The urgency level of any required response

Be conservative - only flag genuine follow-up needs, not informational emails.`,
      system:
        "You are an expert at identifying emails requiring follow-up. " +
        "Look for questions, requests, deadlines, and action items. " +
        "Distinguish between emails needing response and FYI/informational emails.",
    });

    const data: FollowUpAnalysis = analysis.object;

    // no follow-up needed
    if (!data.needsFollowUp || data.actionRequired === "none") {
      return {
        handled: false,
        explanation: {
          summary: "No follow-up needed",
          details: data.context,
        },
        confidence: data.confidence,
      };
    }

    const actions: CapabilityResult["actions"] = [];

    // store follow-up tracking data
    const trackingKey = `followup-${email.id}`;
    await storage.set(trackingKey, {
      emailId: email.id,
      threadId: email.threadId,
      from: email.from,
      subject: email.subject,
      urgency: data.urgency,
      actionRequired: data.actionRequired,
      deadline: data.deadline,
      suggestedDate: data.suggestedFollowUpDate,
      actionItems: data.actionItems,
      stakeholders: data.stakeholders,
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    actions.push({
      type: "custom",
      params: { action: "created-tracking", key: trackingKey },
      executed: true,
    });

    // apply labels if available
    if (emailOperations && email.threadId) {
      try {
        // main follow-up label
        await emailOperations.applyLabel(email.threadId, "Follow-up");
        actions.push({
          type: "label",
          params: { labelName: "Follow-up", threadId: email.threadId },
          executed: true,
        });

        // urgency label
        if (data.urgency === "urgent") {
          await emailOperations.applyLabel(email.threadId, "Follow-up/Urgent");
          actions.push({
            type: "label",
            params: { labelName: "Follow-up/Urgent", threadId: email.threadId },
            executed: true,
          });
        }

        // action type label
        const actionLabels: Record<string, string> = {
          "reply-required": "Follow-up/Reply Needed",
          "decision-needed": "Follow-up/Decision",
          "task-assigned": "Follow-up/Task",
          "information-requested": "Follow-up/Info Request",
          "meeting-response": "Follow-up/RSVP",
        };

        const actionLabel = actionLabels[data.actionRequired];
        if (actionLabel) {
          await emailOperations.applyLabel(email.threadId, actionLabel);
          actions.push({
            type: "label",
            params: { labelName: actionLabel, threadId: email.threadId },
            executed: true,
          });
        }
      } catch (error) {
        actions.push({
          type: "label",
          params: { labelName: "Follow-up" },
          executed: false,
          error: String(error),
        });
      }
    }

    // create calendar reminder if date available and calendar accessible
    const reminderDate = data.deadline || data.suggestedFollowUpDate;
    if (calendar && reminderDate) {
      try {
        const date = new Date(reminderDate);
        // set reminder for 9am on the due date
        date.setHours(9, 0, 0, 0);

        await calendar.createEvent({
          summary: `Follow up: ${email.subject}`,
          description: `Follow-up reminder for email from ${email.from}\n\n${data.context}${
            data.actionItems?.length
              ? `\n\nAction items:\n${data.actionItems.map((a) => `- ${a.task}`).join("\n")}`
              : ""
          }`,
          start: { dateTime: date.toISOString(), timeZone: "UTC" },
          end: {
            dateTime: new Date(date.getTime() + 15 * 60 * 1000).toISOString(),
            timeZone: "UTC",
          },
        });

        actions.push({
          type: "custom",
          params: { action: "created-reminder", date: reminderDate },
          executed: true,
        });
      } catch (error) {
        actions.push({
          type: "custom",
          params: { action: "create-reminder-failed", date: reminderDate },
          executed: false,
          error: String(error),
        });
      }
    }

    // build response
    const urgencyPrefix = data.urgency === "urgent" ? "Urgent: " : "";
    const actionDescriptions: Record<string, string> = {
      "reply-required": "Reply needed",
      "decision-needed": "Decision required",
      "task-assigned": "Task assigned",
      "information-requested": "Info requested",
      "meeting-response": "RSVP needed",
      "follow-up-check": "Check back later",
    };

    const summary = `${urgencyPrefix}${actionDescriptions[data.actionRequired] || "Follow-up needed"}`;

    const details = [
      data.deadline
        ? `Due: ${new Date(data.deadline).toLocaleDateString()}`
        : null,
      data.actionItems?.length
        ? `${data.actionItems.length} action item(s)`
        : null,
      data.context,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      handled: true,
      actions,
      explanation: {
        summary,
        details,
      },
      confidence: data.confidence,
    };
  },
});

export default followUpTracker;
