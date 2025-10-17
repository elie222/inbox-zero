import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Category } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export async function aiCategorizeSender({
  emailAccount,
  sender,
  previousEmails,
  categories,
}: {
  emailAccount: EmailAccountWithAI;
  sender: string;
  previousEmails: { subject: string; snippet: string }[];
  categories: Pick<Category, "name" | "description">[];
}) {
  const system = `You are an AI assistant specializing in email management and organization.
Your task is to categorize an email accounts based on their name, email address, and content from previous emails.
Provide an accurate categorization to help users efficiently manage their inbox.`;

  const prompt = `Categorize the following email account:
${sender}

Previous emails from them:
${previousEmails
  .slice(0, 3)
  .map(
    (email) =>
      `<email><subject>${email.subject}</subject><snippet>${email.snippet}</snippet></email>`,
  )
  .join("\n")}
${previousEmails.length === 0 ? "No previous emails found" : ""}

<categories>
${formatCategoriesForPrompt(categories)}
</categories>

<instructions>
1. Analyze the sender's name and email address for clues about their category.
2. Review the content of previous emails to gain more context about the account's relationship with us.
3. STRONGLY prefer using the provided categories when they fit reasonably well, even if not perfect.
4. Only create new categories when the sender truly doesn't fit any provided category.
5. When creating new categories, use broad, general terms rather than specific ones:
   - Use "Marketing" instead of "Product Onboarding" or "Product Updates"
   - Use "Notifications" instead of "Product Notifications" or "System Alerts"
   - Use "Support" instead of "Customer Success" or "Help Desk"
   - Use "Newsletter" instead of "Weekly Digest" or "Monthly Update"
6. Use "Unknown" for:
   - Personal emails that cannot be meaningfully categorized
   - Senders that appear to be individual people rather than automated systems
   - Unclear or ambiguous senders where a wrong categorization would be worse than no categorization
7. CRITICAL: Do NOT categorize personal senders as newsletters/events/marketing. It's better to mark as "Unknown" than to mislabel personal correspondence.
8. Assign priority levels:
   - low: Newsletters, marketing, promotional content, social media notifications
   - medium: Support tickets, banking notifications, general notifications, receipts
   - high: Critical alerts, server monitoring, important personal communications
9. You MUST return only these priority values: "low", "medium", or "high". No other values.
10. Return your response in JSON format.
</instructions>`;

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Categorize sender",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      rationale: z.string().describe("Keep it short. 1-2 sentences max."),
      category: z.string(),
      priority: z
        .enum(["low", "medium", "high"])
        .describe(
          "Priority level: low (newsletters/marketing), medium (notifications/support), high (critical alerts/personal).",
        ),
    }),
  });

  // Always return the AI response, even if it created a new category
  return aiResponse.object;
}
