import { stepCountIs, tool } from "ai";
import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { createGenerateText } from "@/utils/llms";
import type { Group } from "@prisma/client";
import { queryBatchMessages } from "@/utils/gmail/message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("aiCreateGroup");

const GENERATE_GROUP_ITEMS = "generateGroupItems";
const VERIFY_GROUP_ITEMS = "verifyGroupItems";

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

const verifyGroupItemsSchema = z.object({
  removedSenders: z.array(z.string()),
  removedSubjects: z.array(z.string()),
  reason: z.string(),
});

const listEmailsTool = (gmail: gmail_v1.Gmail) => ({
  description: "List email messages. Returns max 20 results.",
  parameters: z.object({
    query: z.string().optional().describe("Optional Gmail search query."),
  }),
  execute: async ({ query }: { query: string | undefined }) => {
    const { messages } = await queryBatchMessages(gmail, {
      query: `${query || ""} -label:sent`.trim(),
      maxResults: 20,
    });

    const results = messages.map((message) => ({
      from: message.headers.from,
      subject: message.headers.subject,
      snippet: message.snippet,
    }));

    return results;
  },
});

export async function aiGenerateGroupItems(
  emailAccount: EmailAccountWithAI,
  gmail: gmail_v1.Gmail,
  group: Pick<Group, "name" | "prompt">,
): Promise<z.infer<typeof generateGroupItemsSchema>> {
  const system = `You are an AI assistant specializing in email management and organization.
Your task is to create highly specific email groups based on user prompts and their actual email history.

A group is defined by two arrays:
1. senders: An array of email addresses or partial email addresses to match senders.
2. subjects: An array of specific phrases to match in email subject lines.

Both arrays can be empty if no reliable patterns are found.`;

  const prompt = `Create an email group named "${group.name}".
The prompt is: "${group.prompt}".
  
Key guidelines:
1. Carefully analyze and follow ALL aspects of the user's prompt, including any specific inclusions or exclusions.
2. Base suggestions on the user's actual email history.
3. Use the listEmails tool multiple times, including once without a query to get an overview of the inbox.
4. Prioritize specific sender email addresses or domains in the senders array.
5. Only include subject patterns in the subjects array if they are highly specific and consistent across multiple emails.
6. Never suggest emojis, single characters, or very short strings as criteria.
7. Avoid broad terms or patterns that could match unrelated emails.
8. It's better to suggest fewer, more reliable criteria than to risk overgeneralization.
9. If the user explicitly excludes certain types of emails, ensure your suggestions do not include them.`;

  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Create group",
    modelOptions,
  });

  const aiResponse = await generateText({
    ...modelOptions,
    system,
    prompt,
    stopWhen: stepCountIs(10),
    tools: {
      listEmails: listEmailsTool(gmail),
      [GENERATE_GROUP_ITEMS]: tool({
        description: "Create a group",
        inputSchema: generateGroupItemsSchema,
      }),
    },
  });

  const generateGroupItemsToolCalls = aiResponse.toolCalls.filter(
    ({ toolName }) => toolName === GENERATE_GROUP_ITEMS,
  );

  const combinedArgs = generateGroupItemsToolCalls.reduce<
    z.infer<typeof generateGroupItemsSchema>
  >(
    (acc, { input }) => {
      const typedArgs = input as z.infer<typeof generateGroupItemsSchema>;
      return {
        senders: [...acc.senders, ...typedArgs.senders],
        subjects: [...acc.subjects, ...typedArgs.subjects],
      };
    },
    { senders: [], subjects: [] },
  );

  return await verifyGroupItems(emailAccount, gmail, group, combinedArgs);
}

async function verifyGroupItems(
  emailAccount: EmailAccountWithAI,
  gmail: gmail_v1.Gmail,
  group: Pick<Group, "name" | "prompt">,
  initialItems: z.infer<typeof generateGroupItemsSchema>,
): Promise<z.infer<typeof generateGroupItemsSchema>> {
  const system = `You are an AI assistant specializing in email management and organization.
Your task is to identify and remove any incorrect or overly broad criteria from the generated email group.
One word subjects are almost always too broad and should be removed.`;

  const prompt = `Review the following email group criteria for the group "${group.name}" and identify any items that should be removed:

Senders:
${JSON.stringify(initialItems.senders)}

Subjects:
${JSON.stringify(initialItems.subjects)}

Original prompt: "${group.prompt}"

Guidelines:
1. Identify and remove any overly broad, inaccurate, or irrelevant criteria.
2. Ensure remaining criteria align with the original prompt.
3. Use the listEmails tool to verify the accuracy of the criteria if needed.
4. Provide a brief reason for each removed item.
5. If all items are correct and specific, you can return empty arrays for removedSenders and removedSubjects.
6. When using listEmails, make separate calls for each sender and subject. Do not combine them in a single query.`;

  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Verify group criteria",
    modelOptions,
  });

  const aiResponse = await generateText({
    ...modelOptions,
    system,
    prompt,
    stopWhen: stepCountIs(10),
    tools: {
      listEmails: listEmailsTool(gmail),
      [VERIFY_GROUP_ITEMS]: tool({
        description: "Remove incorrect or overly broad group criteria",
        inputSchema: verifyGroupItemsSchema,
      }),
    },
  });

  const verifyGroupItemsToolCalls = aiResponse.toolCalls.filter(
    ({ toolName }) => toolName === VERIFY_GROUP_ITEMS,
  );

  if (verifyGroupItemsToolCalls.length === 0) {
    logger.warn("No verification results found. Returning initial items.");
    return initialItems;
  }

  const toolCall =
    verifyGroupItemsToolCalls[verifyGroupItemsToolCalls.length - 1];

  const verificationResult = toolCall.input as z.infer<
    typeof verifyGroupItemsSchema
  >;

  // Remove the identified items from the initial lists
  const verifiedItems = {
    senders: initialItems.senders.filter(
      (sender) => !verificationResult.removedSenders.includes(sender),
    ),
    subjects: initialItems.subjects.filter(
      (subject) => !verificationResult.removedSubjects.includes(subject),
    ),
  };

  return verifiedItems;
}
