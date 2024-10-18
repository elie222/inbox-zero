import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionTools } from "@/utils/llms";
import type { User } from "@prisma/client";
import { UserAIFields } from "@/utils/llms/types";
import { queryBatchMessages } from "@/utils/gmail/message";

const FIND_EXAMPLE_MATCHES = "findExampleMatches";

export const findExampleMatchesSchema = z.object({
  matches: z
    .array(
      z.object({
        emailId: z.string(),
        rule: z.string(),
      }),
    )
    .describe("The emails that match the rules prompt."),
});

const listEmailsTool = (gmail: gmail_v1.Gmail, accessToken: string) => ({
  description: "List email messages. Returns max 20 results.",
  parameters: z.object({
    query: z.string().optional().describe("Optional Gmail search query."),
  }),
  execute: async ({ query }: { query: string | undefined }) => {
    const { messages } = await queryBatchMessages(gmail, accessToken, {
      query,
      maxResults: 20,
    });

    const results = messages.map((message) => ({
      emailId: message.id,
      from: message.headers.from,
      subject: message.headers.subject,
      snippet: message.snippet,
    }));

    return results;
  },
});

export async function aiFindExampleMatches(
  user: Pick<User, "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  accessToken: string,
  rulesPrompt: string,
): Promise<z.infer<typeof findExampleMatchesSchema>> {
  console.log(`findExampleMatches. rulesPrompt: ${rulesPrompt}`);

  const system = `You are an AI assistant specializing in email management and organization. Your task is to find example emails that match the given rules.`;

  const prompt = `Find example matches for the rules prompt:
<rules>
${rulesPrompt}
</rules>

Key guidelines:
1. Use the listEmails tool to fetch recent emails from the user's inbox.
2. Analyze each email and determine if it matches any of the given rules.
3. For each matching email, provide the emailId and the specific rule it matches.
4. Aim to find 2-3 examples for each rule, if possible.
5. If no matches are found for a particular rule, you can skip it.
6. Use the findExampleMatches tool to return the results.

Please proceed step-by-step, fetching emails and analyzing them to find matches for the given rules.`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    system,
    prompt,
    maxSteps: 10,
    tools: {
      listEmails: listEmailsTool(gmail, accessToken),
      [FIND_EXAMPLE_MATCHES]: {
        description: "Find example matches",
        parameters: findExampleMatchesSchema,
      },
    },
    userEmail: user.email || "",
    label: "Find example matches",
  });

  const findExampleMatchesToolCalls = aiResponse.toolCalls.filter(
    ({ toolName }) => toolName === FIND_EXAMPLE_MATCHES,
  );

  const combinedArgs = findExampleMatchesToolCalls.reduce<
    z.infer<typeof findExampleMatchesSchema>
  >(
    (acc, { args }) => {
      const typedArgs = args as z.infer<typeof findExampleMatchesSchema>;
      return { matches: [...acc.matches, ...typedArgs.matches] };
    },
    { matches: [] },
  );

  return combinedArgs;
}
