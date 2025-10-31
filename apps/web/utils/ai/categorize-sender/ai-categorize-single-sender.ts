import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Category } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import {
  CATEGORIZE_SENDER_SYSTEM_PROMPT,
  CATEGORIZATION_INSTRUCTIONS,
  senderCategorizationSchema,
} from "@/utils/ai/categorize-sender/prompts";

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
Analyze the sender's name and email address for clues about their category.
Review the content of previous emails to gain more context about the account's relationship with us.

${CATEGORIZATION_INSTRUCTIONS}
</instructions>`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Categorize sender",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system: CATEGORIZE_SENDER_SYSTEM_PROMPT,
    prompt,
    schema: senderCategorizationSchema,
  });

  return aiResponse.object;
}
