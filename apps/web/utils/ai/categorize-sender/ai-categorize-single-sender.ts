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
3. If the category is clear, assign it.
4. If you're not certain, respond with "Unknown".
5. If multiple categories are possible, respond with "Unknown".
6. Return your response in JSON format.
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
    }),
  });

  if (!categories.find((c) => c.name === aiResponse.object.category))
    return null;

  return aiResponse.object;
}
