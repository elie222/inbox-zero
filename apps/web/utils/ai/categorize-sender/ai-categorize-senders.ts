import { z } from "zod";
import { isDefined } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Category } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";
import { extractEmailAddress } from "@/utils/email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import {
  CATEGORIZE_SENDER_SYSTEM_PROMPT,
  CATEGORIZATION_INSTRUCTIONS,
  bulkSenderCategorizationItemSchema,
} from "@/utils/ai/categorize-sender/prompts";

const categorizeSendersSchema = z.object({
  senders: z.array(bulkSenderCategorizationItemSchema),
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
Analyze each sender's email address and their recent emails for categorization.

${CATEGORIZATION_INSTRUCTIONS}
</instructions>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Categorize senders bulk",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system: CATEGORIZE_SENDER_SYSTEM_PROMPT,
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
