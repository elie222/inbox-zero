/**
 * Newsletter Manager Capability Example
 *
 * Demonstrates a capability that:
 * - Identifies newsletter and marketing emails
 * - Categorizes newsletters by topic
 * - Auto-archives low-priority newsletters
 * - Tracks newsletter subscriptions
 *
 * Required capabilities: email:classify, email:modify
 */
import { z } from "zod";
import { defineCapability } from "../helpers/define-capability";
import type { CapabilityContext, CapabilityResult } from "../types/capability";

/**
 * Schema for newsletter analysis
 */
const newsletterAnalysisSchema = z.object({
  isNewsletter: z
    .boolean()
    .describe("Whether this is a newsletter or marketing email"),
  type: z
    .enum([
      "newsletter", // regular newsletter content
      "digest", // aggregated content digest
      "promotion", // marketing/promotional
      "announcement", // product announcements
      "transactional", // not a newsletter - transactional email
    ])
    .describe("Type of email"),
  category: z
    .enum([
      "tech",
      "business",
      "finance",
      "news",
      "lifestyle",
      "entertainment",
      "education",
      "health",
      "shopping",
      "other",
    ])
    .optional()
    .describe("Content category"),
  sender: z.string().optional().describe("Newsletter sender/publication name"),
  frequency: z
    .enum(["daily", "weekly", "monthly", "occasional", "unknown"])
    .optional()
    .describe("Estimated sending frequency"),
  hasUnsubscribe: z.boolean().describe("Whether unsubscribe link is present"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Suggested priority based on content type"),
  confidence: z.number().min(0).max(1),
});

type NewsletterAnalysis = z.infer<typeof newsletterAnalysisSchema>;

/**
 * Newsletter Manager Capability
 *
 * Manages newsletter and marketing emails by:
 * 1. Identifying newsletters vs transactional emails
 * 2. Categorizing by topic and importance
 * 3. Auto-organizing into labeled folders
 * 4. Optionally archiving low-priority newsletters
 *
 * @example plugin.json capabilities
 * ```json
 * {
 *   "capabilities": ["email:classify", "email:modify"]
 * }
 * ```
 */
export const newsletterManager = defineCapability({
  id: "newsletter-manager",
  name: "Newsletter Manager",
  description:
    "Identifies and organizes newsletter and marketing emails. Categorizes by topic, " +
    "tracks subscriptions, and helps manage inbox clutter from bulk mailings.",

  routingHints: [
    // newsletter indicators
    "newsletter",
    "unsubscribe",
    "weekly digest",
    "daily digest",
    "mailing list",
    // marketing indicators
    "promotional",
    "special offer",
    "limited time",
    "exclusive deal",
    // sender patterns
    "noreply",
    "news@",
    "newsletter@",
    "updates@",
    // content patterns
    "read more",
    "view in browser",
    "email preferences",
    "manage subscriptions",
  ],

  /**
   * Quick check for newsletter patterns
   */
  async canHandle(ctx: CapabilityContext): Promise<boolean> {
    const { subject, from, snippet, headers } = ctx.email;
    const text = `${subject} ${from} ${snippet}`.toLowerCase();

    // check for list-unsubscribe header (strong newsletter signal)
    if (headers["list-unsubscribe"]) {
      return true;
    }

    // common newsletter patterns
    const patterns = [
      "unsubscribe",
      "newsletter",
      "digest",
      "weekly update",
      "noreply",
      "view in browser",
      "mailing list",
    ];

    return patterns.some((p) => text.includes(p));
  },

  /**
   * Analyze and organize the newsletter
   */
  async execute(ctx: CapabilityContext): Promise<CapabilityResult> {
    const { email, llm, storage, emailOperations } = ctx;

    // analyze newsletter content
    const analysis = await llm.generateObject({
      schema: newsletterAnalysisSchema,
      prompt: `Analyze this email to determine if it's a newsletter or marketing email.

Subject: ${email.subject}
From: ${email.from}
Content preview: ${email.snippet}

Determine the type, category, and suggested priority for this email.
Look for unsubscribe links, newsletter formatting, and promotional language.`,
      system:
        "You are an expert at identifying newsletters and marketing emails. " +
        "Distinguish between valuable content newsletters and low-priority promotional emails. " +
        "Consider sender reputation, content quality indicators, and user engagement signals.",
    });

    const data: NewsletterAnalysis = analysis.object;

    // not a newsletter
    if (!data.isNewsletter || data.type === "transactional") {
      return {
        handled: false,
        explanation: {
          summary: "Not a newsletter",
          details:
            "This appears to be a transactional or personal email, not a newsletter.",
        },
        confidence: data.confidence,
      };
    }

    const actions: CapabilityResult["actions"] = [];

    // track this newsletter subscription
    if (data.sender) {
      const subscriptionKey = `newsletter-sub-${email.from.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      const existingSub = await storage.get<{
        firstSeen: string;
        count: number;
        lastSeen: string;
      }>(subscriptionKey);

      await storage.set(subscriptionKey, {
        sender: data.sender,
        from: email.from,
        category: data.category,
        frequency: data.frequency,
        firstSeen: existingSub?.firstSeen || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        count: (existingSub?.count || 0) + 1,
      });

      actions.push({
        type: "custom",
        params: { action: "tracked-subscription", sender: data.sender },
        executed: true,
      });
    }

    // apply labels if available
    if (emailOperations && email.threadId) {
      try {
        // main newsletter label
        await emailOperations.applyLabel(email.threadId, "Newsletters");
        actions.push({
          type: "label",
          params: { labelName: "Newsletters", threadId: email.threadId },
          executed: true,
        });

        // type-specific label
        if (data.type !== "newsletter") {
          const typeLabel = `Newsletters/${data.type}`;
          await emailOperations.applyLabel(email.threadId, typeLabel);
          actions.push({
            type: "label",
            params: { labelName: typeLabel, threadId: email.threadId },
            executed: true,
          });
        }

        // category label for valuable content
        if (data.category && data.priority !== "low") {
          const categoryLabel = `Newsletters/${data.category}`;
          await emailOperations.applyLabel(email.threadId, categoryLabel);
          actions.push({
            type: "label",
            params: { labelName: categoryLabel, threadId: email.threadId },
            executed: true,
          });
        }

        // auto-archive low priority promotional emails
        if (data.priority === "low" && data.type === "promotion") {
          await emailOperations.archive(email.threadId);
          actions.push({
            type: "archive",
            params: {
              threadId: email.threadId,
              reason: "low-priority-promotion",
            },
            executed: true,
          });
        }
      } catch (error) {
        actions.push({
          type: "label",
          params: { labelName: "Newsletters" },
          executed: false,
          error: String(error),
        });
      }
    }

    // build response
    const summary =
      data.sender ||
      email.from.split("@")[0].replace(/[._-]/g, " ").trim() ||
      "Newsletter";

    const details = [
      `Type: ${data.type}`,
      data.category ? `Category: ${data.category}` : null,
      `Priority: ${data.priority}`,
      data.frequency !== "unknown" ? `Frequency: ${data.frequency}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      handled: true,
      actions,
      explanation: {
        summary: `${summary}${data.priority === "low" ? " (archived)" : ""}`,
        details,
      },
      confidence: data.confidence,
    };
  },
});

export default newsletterManager;
