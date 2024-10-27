import { z } from "zod";
import { SenderCategory } from "@/utils/categories";
import { chatCompletionObject } from "@/utils/llms";
import { isDefined } from "@/utils/types";
import type { UserAIFields } from "@/utils/llms/types";
import type { User } from "@prisma/client";

const categories = [
  ...Object.values(SenderCategory).filter((c) => c !== "unknown"),
  "request_more_information",
];

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
}: {
  user: Pick<User, "email"> & UserAIFields;
  senders: { emailAddress: string; snippet: string }[];
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
    ({ emailAddress, snippet }) => `
<sender>
  <email>${emailAddress}</email>
  <snippet>${snippet}</snippet>
</sender>`,
  )
  .join("\n")}
</senders>

<categories>
${categories.map((category) => `* ${category}`).join("\n")}
</categories>

Instructions:
1. Analyze each sender's name and email address for clues about their category.
2. If the sender's category is clear, assign it confidently.
3. If you're unsure or if multiple categories could apply, respond with "request_more_information".
4. If requesting more information, use "request_more_information" as the value.
5. For individual senders, you'll want to "request_more_information". For example, rachel.smith@company.com, we don't know if their a customer, or sending us marketing, or something else.

Remember, it's better to request more information than to categorize incorrectly.`;

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema: categorizeSendersSchema,
    userEmail: user.email || "",
    usageLabel: "categorize senders",
  });

  const matchedSenders = matchSendersWithFullEmail(
    aiResponse.object.senders,
    senders.map((s) => s.emailAddress),
  );

  // filter out any senders that don't have a valid category
  return matchedSenders.map((r) => {
    if (!categories.includes(r.category)) {
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
