import { z } from "zod";
import { SenderCategory } from "@/app/api/user/categorise/senders/categorise-sender";
import { chatCompletionTools } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";
import type { User } from "@prisma/client";

const categories = [
  ...Object.values(SenderCategory).filter((c) => c !== "unknown"),
  "request_more_information",
];

const categoriseSendersSchema = z.object({
  senders: z
    .array(
      z.object({
        sender: z.string().describe("The email address of the sender"),
        category: z
          .enum(categories as [string, ...string[]])
          .describe("The category of the sender"),
      }),
    )
    .describe("An array of senders and their categories"),
});

type CategoriseSenders = z.infer<typeof categoriseSendersSchema>;

export async function aiCategoriseSenders({
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
      categoriseSenders: {
        description: "Categorise senders",
        parameters: categoriseSendersSchema,
      },
    },
    userEmail: user.email || "",
    label: "Categorise senders",
  });

  const result: CategoriseSenders["senders"] = aiResponse.toolCalls.find(
    ({ toolName }) => toolName === "categoriseSenders",
  )?.args.senders;

  return result;
}
