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

export async function aiFindExampleMatches(
  user: Pick<User, "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  accessToken: string,
  rulesPrompt: string,
) {
  console.log(`findExampleMatches. rulesPrompt: ${rulesPrompt}`);

  const system = `You are an AI assistant specializing in email management and organization. Your task is to find example emails that match the given rules with high confidence.`;

  const prompt = `Find high-confidence example matches for the rules prompt:
<rules>
${rulesPrompt}
</rules>

Key guidelines:
1. Use the listEmails tool to fetch recent emails from the user's inbox.
2. Analyze each email and determine if it matches any of the given rules with absolute certainty.
3. For each matching email, provide the emailId and the specific rule it matches.
4. Only return matches that you are 100% confident about. It's better to return no matches than to include uncertain ones.
5. Aim for quality over quantity. Even a single high-confidence match is valuable.
6. If no high-confidence matches are found for any rule, it's acceptable to return an empty result.
7. Use the findExampleMatches tool to return only the high-confidence results.
8. Aim for a few high-confidence matches per rule.

Please proceed step-by-step, fetching emails and analyzing them to find only the most certain matches for the given rules. Remember, precision is crucial - only include matches you are absolutely sure about.`;

  const listedEmails: Record<
    string,
    { emailId: string; from: string; subject: string; snippet: string }
  > = {};

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

      results.forEach((result) => {
        listedEmails[result.emailId] = result;
      });

      return results;
    },
  });

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

  const matches = findExampleMatchesToolCalls.reduce<
    z.infer<typeof findExampleMatchesSchema>["matches"]
  >((acc, { args }) => {
    const typedArgs = args as z.infer<typeof findExampleMatchesSchema>;

    return [...acc, ...typedArgs.matches];
  }, []);

  return {
    matches: matches
      .filter((match) => listedEmails[match.emailId])
      .map((match) => ({
        ...listedEmails[match.emailId],
        rule: match.rule,
      })),
  };
}
