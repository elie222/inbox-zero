import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import { isDefined } from "@/utils/types";
import type { UserAIFields } from "@/utils/llms/types";
import type { Category, User } from "@prisma/client";
import { formatCategoriesForPrompt } from "@/utils/ai/categorize-sender/format-categories";

export const REQUEST_MORE_INFORMATION_CATEGORY = "RequestMoreInformation";

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
  user,
  senders,
  categories,
}: {
  user: Pick<User, "email"> & UserAIFields;
  senders: { emailAddress: string; snippets: string[] }[];
  categories: Pick<Category, "name" | "description">[];
}): Promise<
  {
    category?: string;
    sender: string;
  }[]
> {
  if (senders.length === 0) return [];

  const system = `You are an AI assistant specializing in email management and organization.
Your task is to categorize email senders based on their names, email addresses, and any available content patterns.
Provide accurate categorizations to help users efficiently manage their inbox.`;

  const prompt = `Categorize the following email senders:

<senders>
${senders
  .map(
    ({ emailAddress, snippets }) => `
<sender>
  <email>${emailAddress}</email>
  <snippets>${
    snippets.length
      ? snippets.map((s) => `* ${s}`).join("\n")
      : "No emails available"
  }</snippets>
</sender>`,
  )
  .join("\n")}
</senders>

<categories>
${formatCategoriesForPrompt(categories)}
</categories>

Instructions:
1. Analyze each sender's name and email address for clues about their category.
2. If the sender's category is clear, assign it confidently.
3. If you're unsure or if multiple categories could apply, respond with "Unknown".
4. To request more information, respond with "${REQUEST_MORE_INFORMATION_CATEGORY}".

Remember, it's better to respond with "Unknown" than to categorize incorrectly.`;

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema: categorizeSendersSchema,
    userEmail: user.email || "",
    usageLabel: "Categorize senders bulk",
  });

  const matchedSenders = matchSendersWithFullEmail(
    aiResponse.object.senders,
    senders.map((s) => s.emailAddress),
  );

  // filter out any senders that don't have a valid category
  return matchedSenders.map((r) => {
    if (!categories.find((c) => c.name === r.category)) {
      return {
        category: undefined,
        sender: r.sender,
      };
    }

    return r;
  });
}

// match up emails with full email
// this is done so that the LLM can return less text in the response
// and also so that we can match sure the senders it's returning are part of the input (and it didn't hallucinate)
// NOTE: if there are two senders with the same email address (but different names), it will only return one of them
function matchSendersWithFullEmail(
  aiResponseSenders: z.infer<typeof categorizeSendersSchema>["senders"],
  originalSenders: string[],
) {
  return aiResponseSenders
    .map((r) => {
      const sender = originalSenders.find((s) => s.includes(r.sender));

      if (!sender) return;

      return {
        category: r.category,
        sender,
      };
    })
    .filter(isDefined);
}
