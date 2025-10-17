import { z } from "zod";
import { isDefined } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Category } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";
import { extractEmailAddress } from "@/utils/email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export const REQUEST_MORE_INFORMATION_CATEGORY = "RequestMoreInformation";
export const UNKNOWN_CATEGORY = "Unknown";

const categorizeSendersSchema = z.object({
  senders: z.array(
    z.object({
      rationale: z.string().describe("Keep it short."),
      sender: z.string(),
      category: z.string(), // allow AI to create a new category if it wants
      priority: z
        .enum(["low", "medium", "high"])
        .describe(
          "Priority level based on urgency and importance: low for informational content (e.g., newsletters), medium for transactional communications (e.g., receipts), high for time-sensitive or critical messages (e.g., personal communications).",
        ),
    }),
  ),
});

export async function aiCategorizeSenders({
  emailAccount,
  senders,
  categories,
}: {
  emailAccount: EmailAccountWithAI;
  senders: {
    emailAddress: string;
    emails: { subject: string; snippet: string }[];
  }[];
  categories: Pick<Category, "name" | "description">[];
}): Promise<
  {
    category?: string;
    sender: string;
    priority?: "low" | "medium" | "high";
  }[]
> {
  if (senders.length === 0) return [];

  const system = `You are an AI assistant specializing in email management and organization.
Your task is to categorize email accounts based on their names, email addresses, and emails they've sent us.
Provide accurate categorizations to help users efficiently manage their inbox.`;

  const prompt = `Categorize the following senders:

  ${senders
    .map(
      ({ emailAddress, emails }) => `<sender>
  <email_address>${emailAddress}</email_address>
  ${
    emails.length
      ? `<recent_emails>
          ${emails
            .map(
              (s) => `
            <email>
              <subject>${s.subject}</subject>
              <snippet>${s.snippet}</snippet>
            </email>`,
            )
            .join("")}
          </recent_emails>`
      : "<recent_emails>No emails available</recent_emails>"
  }
</sender>`,
    )
    .join("\n")}

<categories>
${formatCategoriesForPrompt(categories)}
</categories>

<instructions>
1. Analyze each sender's email address and their recent emails for categorization.

2. STRONGLY prefer existing categories over creating new ones - use them when they fit reasonably well, even if not perfect.

3. When creating new categories, use broad, general terms rather than specific ones:
   - "Personal" for individual people and personal correspondence
   - "Marketing" covers product updates, onboarding, promotional content
   - "Notifications" covers system alerts, product notifications, general notifications
   - "Support" covers customer success, help desk, technical support
   - "Newsletter" covers digests, updates, regular communications

4. Use "Personal" for:
   - Individual people and personal correspondence
   - Senders that appear to be real people (not automated systems)

5. Use "Unknown" only as a fallback for:
   - Unclear or ambiguous senders where any categorization would be unreliable
   - Senders with insufficient information to make a determination

6. CRITICAL: NEVER categorize personal emails as newsletters/events/marketing. Always use "Personal" for individual correspondence.

7. Assign priority levels:
   - low: Newsletters, marketing, promotional content, social media notifications
   - medium: Support tickets, banking notifications, general notifications, receipts
   - high: Critical alerts, server monitoring, important personal communications
</instructions>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Categorize senders bulk",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: categorizeSendersSchema,
  });

  const matchedSenders = matchSendersWithFullEmail(
    aiResponse.object.senders,
    senders.map((s) => s.emailAddress),
  );

  return matchedSenders;
}

// match up emails with full email
// this is done so that the LLM can return less text in the response
// and also so that we can match sure the senders it's returning are part of the input (and it didn't hallucinate)
// NOTE: if there are two senders with the same email address (but different names), it will only return one of them
function matchSendersWithFullEmail(
  aiResponseSenders: z.infer<typeof categorizeSendersSchema>["senders"],
  originalSenders: string[],
) {
  const normalizedOriginalSenders: Record<string, string> = {};
  for (const sender of originalSenders) {
    normalizedOriginalSenders[sender] = extractEmailAddress(sender);
  }

  return aiResponseSenders
    .map((r) => {
      const normalizedResponseSender = extractEmailAddress(r.sender);
      const sender = originalSenders.find(
        (s) => normalizedOriginalSenders[s] === normalizedResponseSender,
      );

      if (!sender) return;

      return { sender, category: r.category, priority: r.priority };
    })
    .filter(isDefined);
}
