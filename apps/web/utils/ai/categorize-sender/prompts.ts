import { z } from "zod";

export const CATEGORIZE_SENDER_SYSTEM_PROMPT = `You are an AI assistant specializing in email management and organization.
Your task is to categorize email accounts based on their names, email addresses, and emails they've sent us.
Provide accurate categorizations to help users efficiently manage their inbox.`;

export const CATEGORIZATION_INSTRUCTIONS = `STRONGLY prefer using the provided categories when they fit reasonably well, even if not perfect. Only create new categories when the sender truly doesn't fit any provided category.

When creating new categories, use broad, general terms rather than specific ones:
   - "Personal" for individual people and personal correspondence
   - "Marketing" covers product updates, onboarding, promotional content
   - "Notifications" covers system alerts, product notifications, general notifications
   - "Support" covers customer success, help desk, technical support
   - "Newsletter" covers digests, updates, regular communications

Use "Personal" for:
   - Individual people and personal correspondence
   - Senders that appear to be real people (not automated systems)

Use "Unknown" only as a fallback for:
   - Unclear or ambiguous senders where any categorization would be unreliable
   - Senders with insufficient information to make a determination

CRITICAL: NEVER categorize personal emails as newsletters/events/marketing. Always use "Personal" for individual correspondence.

Assign priority levels:
   - low: Newsletters, marketing, promotional content, social media notifications
   - medium: Support tickets, banking notifications, general notifications, receipts
   - high: Critical alerts, server monitoring, important personal communications`;

export const senderCategorizationSchema = z.object({
  rationale: z.string().describe("Keep it short. 1 sentence."),
  category: z.string(),
  priority: z
    .enum(["low", "medium", "high"])
    .describe(
      "Priority level: low (newsletters/marketing), medium (notifications/support), high (critical alerts/personal).",
    ),
});

export const bulkSenderCategorizationItemSchema =
  senderCategorizationSchema.extend({
    sender: z.string(),
  });
