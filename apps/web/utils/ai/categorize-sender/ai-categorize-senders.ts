import { z } from "zod";
import { SenderCategory } from "@/app/api/user/categorize/senders/categorize-sender";
import { chatCompletionTools } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";
import type { User } from "@prisma/client";

const categories = [
  ...Object.values(SenderCategory).filter((c) => c !== "unknown"),
  "request_more_information",
];

const categorizeSendersSchema = z.object({
  senders: z
    .array(
      z.object({
        sender: z.string().describe("The email address of the sender"),
        category: z
          .enum(categories as [string, ...string[]])
          .describe("The category of the sender"),
        // confidence: z
        //   .number()
        //   .describe(
        //     "The confidence score of the category. A value between 0 and 100.",
        //   ),
      }),
    )
    .describe("An array of senders and their categories"),
});

type CategorizeSenders = z.infer<typeof categorizeSendersSchema>;

export async function aiCategorizeSenders({
  user,
  senders,
}: {
  user: Pick<User, "email"> & UserAIFields;
  senders: string[];
}) {
  if (senders.length === 0) return [];

  const system = `You are an AI assistant specializing in email management and organization.
Your task is to categorize email senders based on their names, email addresses, and any available content patterns.
Provide accurate categorizations to help users efficiently manage their inbox.`;

  const prompt = `Categorize the following email senders: ${senders.join(", ")}.

Instructions:
1. Analyze each sender's name and email address for clues about their category.
2. If the sender's category is clear, assign it confidently.
3. If you're unsure or if multiple categories could apply, respond with "request_more_information".
4. If requesting more information, use "request_more_information" as the value.

Example response:
{
  "newsletter@store.com": "newsletter",
  "john@company.com": "request_more_information",
  "unknown@example.com": "request_more_information"
}

Remember, it's better to request more information than to categorize incorrectly.`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    system,
    prompt,
    tools: {
      categorizeSenders: {
        description: "categorize senders",
        parameters: categorizeSendersSchema,
      },
    },
    userEmail: user.email || "",
    label: "categorize senders",
  });

  const result: CategorizeSenders["senders"] = aiResponse.toolCalls.find(
    ({ toolName }) => toolName === "categorizeSenders",
  )?.args.senders;

  return result;
}
