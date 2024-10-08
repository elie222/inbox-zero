import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionTools } from "@/utils/llms";
import type { Group, User } from "@prisma/client";
import { queryBatchMessages } from "@/utils/gmail/message";
import { UserAIFields } from "@/utils/llms/types";

const GENERATE_GROUP_ITEMS = "generateGroupItems";

const generateGroupItemsSchema = z.object({
  senders: z
    .array(z.string())
    .describe(
      "The senders in the group. Can also be part of the sender name like 'John Smith' or 'Acme Corp' or '@acme.com'.",
    ),
  subjects: z
    .array(z.string())
    .describe(
      "The subjects in the group. Can also be part of the subject line like 'meeting' or 'reminder' or 'invoice #'.",
    ),
});

export async function aiGenerateGroupItems(
  user: Pick<User, "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  accessToken: string,
  group: Pick<Group, "name" | "prompt">,
): Promise<z.infer<typeof generateGroupItemsSchema>> {
  const system = `You are an assistant that helps people manage their emails.
You create groups of emails based on the user's prompt.
Search the user's emails to help populate the group.

Be careful to not to use terms that are too broad when creating a group as the group will then include items it shouldn't.
For example, if the user wishes to create a group for 'crypto newsletters', you may think it's a good idea to include the subject line 'crypto', but this might also include an important email from Coinbase.
Groups are used to apply bulk actions to a set of emails, so it's important to be specific.
If a user decides to auto archive all emails in the group, they don't want important emails from Coinbase to be archived.
`;

  const prompt = `I am creating a group called "${group.name}".
Populate the group with emails based on the following prompt: "${group.prompt}".
`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    system,
    prompt,
    maxSteps: 3,
    tools: {
      listEmails: {
        description: "List email messages. Returns max 20 results",
        parameters: z.object({
          query: z.string().optional().describe("Optional Gmail search query"),
        }),
        execute: async ({ query }: { query: string | undefined }) => {
          const { messages } = await queryBatchMessages(gmail, accessToken, {
            query,
            maxResults: 20,
          });

          return messages.map((message) => ({
            from: message.headers.from,
            subject: message.headers.subject,
            snippet: message.snippet,
          }));
        },
      },
      [GENERATE_GROUP_ITEMS]: {
        description: "Create a group",
        parameters: generateGroupItemsSchema,
      },
    },
    userEmail: user.email || "",
    label: "Create group",
  });

  const toolCall = aiResponse.toolCalls.find(
    ({ toolName }) => toolName === GENERATE_GROUP_ITEMS,
  );

  const args = toolCall?.args as z.infer<
    typeof generateGroupItemsSchema
  > | null;

  return args ?? { senders: [], subjects: [] };
}
