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
      category: z.string(), // not using enum, because sometimes the ai creates new categories, which throws an error. we prefer to handle this ourselves
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
2. If the sender's category is clear, assign it.
3. Use "Unknown" if the category is unclear or multiple categories could apply.
4. Use "${REQUEST_MORE_INFORMATION_CATEGORY}" if more context is needed.
</instructions>

<important>
- Accuracy is more important than completeness
- Only use the categories provided above
- Respond with "Unknown" if unsure
- Return your response in JSON format
</important>`;

  const modelOptions = getModel(emailAccount.user, "chat");

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

  // filter out any senders that don't have a valid category
  const results = matchedSenders.map((r) => {
    if (!categories.find((c) => c.name === r.category)) {
      return {
        category: undefined,
        sender: r.sender,
      };
    }

    return r;
  });

  return results;
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

      return { sender, category: r.category };
    })
    .filter(isDefined);
}
