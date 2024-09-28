import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";

const parameters = z.object({
  rules: z
    .array(z.string())
    .describe("List of generated rules for email management"),
});

export async function aiGenerateRulesPrompt({
  user,
  lastSentEmails,
  userLabels,
}: {
  user: UserAIFields & { email: string };
  lastSentEmails: string[];
  userLabels: string[];
}): Promise<string[]> {
  const emailSummary = lastSentEmails
    .map((email, index) => `Email ${index + 1}:\n${email}\n`)
    .join("\n");

  const labelsList = userLabels.map((label) => `- ${label}`).join("\n");

  const system =
    "You are an AI assistant that helps people manage their emails by generating rules based on their email behavior and existing labels.";

  const prompt = `
Analyze the user's email behavior and suggest general rules for managing their inbox effectively. Here's the context:

User Email: ${user.email}

Last 20 Sent Emails:
${emailSummary}

User's Labels:
${labelsList}

Generate a list of email management rules that would be broadly applicable for this user based on their email behavior and existing labels. The rules should be general enough to apply to various situations, not just specific recent emails. Include actions such as labeling, archiving, forwarding, replying, and drafting responses. Here are some examples of the format and complexity of rules you can create:

* Label newsletters as "Newsletter" and archive them
* If someone asks to schedule a meeting, send them your calendar link
* For cold emails or unsolicited pitches, draft a polite decline response
* Label emails related to financial matters as "Finance" and mark as important
* Forward emails about technical issues to the support team
* For emails from key clients or partners, label as "VIP" and keep in inbox

Focus on creating rules that will help the user organize their inbox more efficiently, save time, and automate responses where appropriate. Consider the following aspects:

1. Labeling and organizing emails by general categories (e.g., Work, Personal, Finance)
2. Handling common types of requests (e.g., meeting requests, support inquiries)
3. Automating responses for recurring scenarios
4. Forwarding specific types of emails to relevant team members
5. Prioritizing important or urgent emails
6. Dealing with newsletters, marketing emails, and potential spam

Your response should only include the list of general rules. Aim for 3-15 broadly applicable rules that would be useful for this user's email management.
`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      generate_rules: {
        description: "Generate a list of email management rules",
        parameters,
      },
    },
    userEmail: user.email,
    label: "Generate rules prompt",
  });

  const parsedRules = aiResponse.toolCalls[0].args as z.infer<
    typeof parameters
  >;

  return parsedRules.rules;
}
