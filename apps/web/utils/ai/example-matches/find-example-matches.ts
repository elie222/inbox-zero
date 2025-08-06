import { tool } from "ai";
import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionTools } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { queryBatchMessages } from "@/utils/gmail/message";

const FIND_EXAMPLE_MATCHES = "findExampleMatches";

export const findExampleMatchesSchema = z.object({
  matches: z
    .array(
      z.object({
        emailId: z.string().describe("The email ID of a matching email."),
        rule: z.string().describe("The specific rule that the email matches."),
        reason: z
          .string()
          .describe(
            "Explanation of why this email is a definite match for the rule.",
          ),
        // isMatch: z.boolean().describe("Must be true. Only include if this is a definite match for the rule."),
      }),
    )
    .describe(
      "Only include emails that definitely match the rules. Do not include non-matches or uncertain matches.",
    ),
});

export async function aiFindExampleMatches(
  emailAccount: EmailAccountWithAI,
  gmail: gmail_v1.Gmail,
  rulesPrompt: string,
) {
  const system =
    "You are an AI assistant specializing in email management and organization. Your task is to find example emails that match the given rules with high confidence.";

  const prompt = `Find high-confidence example matches for the rules prompt:
<rules>
${rulesPrompt}
</rules>

Critical instructions:
1. Analyze each email carefully. Only return matches you are absolutely certain follow these guidelines.
2. Quality over quantity is crucial. It's better to return no matches than to include incorrect or uncertain ones.
   - Only return matches that you are 100% confident about.
   - Aim for a few high-confidence matches per rule.
   - Even a single high-confidence match is valuable.
3. You must strictly differentiate between emails that initiate an action and emails that confirm an action has already occurred. 
  - If a rule mentions "asks to", "requests to", or similar phrases indicating initiation, only match emails that contain the initial request. Do not match confirmation emails for these rules.
  - Confirmation emails (e.g., "Your meeting is scheduled") are not matches for rules about initiating actions, even if they relate to the same topic.

Example:
- Rule: "If a customer asks to set up a call, send them my calendar link"
  - Match: An email saying "Can we schedule a call next week?"
  - Do not match: An email saying "Your call is scheduled for Tuesday at 2 PM"

Use the listEmails tool to fetch emails and the findExampleMatches tool to return results.
If no high-confidence matches are found for any rule, it's acceptable to return an empty result.

Please proceed step-by-step, fetching emails and analyzing them to find only the most certain matches for the given rules.
Remember, precision is crucial - only include matches you are absolutely sure about.`;

  const listedEmails: Record<
    string,
    { emailId: string; from: string; subject: string; snippet: string }
  > = {};

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
        emailId: message.id,
        from: message.headers.from,
        subject: message.headers.subject,
        snippet: message.snippet,
      }));

      for (const result of results) {
        listedEmails[result.emailId] = result;
      }

      return results;
    },
  });

  const aiResponse = await chatCompletionTools({
    userAi: emailAccount.user,
    system,
    prompt,
    maxSteps: 10,
    tools: {
      listEmails: listEmailsTool(gmail),
      [FIND_EXAMPLE_MATCHES]: tool({
        description: "Find example matches",
        inputSchema: findExampleMatchesSchema,
      }),
    },
    userEmail: emailAccount.email,
    label: "Find example matches",
  });

  const findExampleMatchesToolCalls = aiResponse.toolCalls.filter(
    ({ toolName }) => toolName === FIND_EXAMPLE_MATCHES,
  );

  const matches = findExampleMatchesToolCalls.reduce<
    z.infer<typeof findExampleMatchesSchema>["matches"]
  >((acc, { input }) => {
    const typedArgs = input as z.infer<typeof findExampleMatchesSchema>;
    return acc.concat(typedArgs.matches);
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
