import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai-detect-recurring-pattern");

// const braintrust = new Braintrust("recurring-pattern-detection");

const schema = z.object({
  matchedRule: z.string().nullish(),
  explanation: z.string(),
});
export type DetectPatternResult = z.infer<typeof schema>;

export async function aiDetectRecurringPattern({
  emails,
  emailAccount,
  rules,
}: {
  emails: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  rules: {
    name: string;
    instructions: string;
  }[];
}): Promise<DetectPatternResult | null> {
  // Extract the sender email from the first email
  // All emails should be from the same sender
  const senderEmail = emails[0].from;

  if (!senderEmail) return null;

  const system = `You are an AI assistant that helps analyze if a sender's emails should consistently be matched to a specific rule.

<instructions>
Your task is to determine if emails from a specific sender should ALWAYS be matched to the same rule.

Analyze the email content to determine if this sender ALWAYS matches a specific rule.
Only return a matchedRule if you're 100% confident all future emails from this sender will serve the same purpose; otherwise return null.

A sender should only be matched to a rule if you are HIGHLY CONFIDENT (>80%) that:
- All future emails from this sender will serve the same purpose
- The purpose clearly aligns with one specific rule
- There's a consistent pattern across all sample emails provided

Examples of senders that typically match a single rule:
- invoice@stripe.com → receipt rule (always sends payment confirmations)
- newsletter@substack.com → newsletter rule (always sends newsletters)
- noreply@linkedin.com → social rule (always job or connection notifications)

Pay close attention to the ACTUAL CONTENT of the sample emails provided. The decision should be based primarily on content analysis, not just the sender's email pattern.

Be conservative in your matching. If there's any doubt, return null for "matchedRule".
</instructions>

<user_rules>
${rules
  .map(
    (rule) => `<rule>
  <name>${rule.name}</name>
  <criteria>${rule.instructions}</criteria>
</rule>`,
  )
  .join("\n")}
</user_rules>

${
  emailAccount.about
    ? `<user_info>\n<about>${emailAccount.about}</about>\n<email>${emailAccount.email}</email>\n</user_info>`
    : `<user_info>\n<email>${emailAccount.email}</email>\n</user_info>`
}

<outputFormat>
Respond with a JSON object with the following fields:
- "matchedRule": string or null - the name of the existing rule that should handle all emails from this sender
- "explanation": string - one sentence explanation of why this rule does or doesn't match

If you're not confident (at least 80% certain) that a single rule should handle all emails from this sender, return null for matchedRule.
</outputFormat>`;

  const prompt = `Analyze these emails and determine if they consistently match a rule:

<sender>${senderEmail}</sender>

<sample_emails>
${emails
  .map((email) => {
    return `<email>
${stringifyEmail(email, 500)}
</email>`;
  })
  .join("\n")}
</sample_emails>`;

  try {
    const modelOptions = getModel(emailAccount.user, "chat");

    const generateObject = createGenerateObject({
      userEmail: emailAccount.email,
      label: "Detect recurring pattern",
      modelOptions,
    });

    const aiResponse = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    // braintrust.insertToDataset({
    //   id: emails[0].id,
    //   input: {
    //     senderEmail,
    //     emailCount: emails.length,
    //     sampleEmails: emails.map((email) => ({
    //       from: email.from,
    //       subject: email.subject,
    //     })),
    //     rules: rules.map((rule) => rule.name),
    //   },
    //   expected: aiResponse.object.matchedRule,
    // });

    return aiResponse.object;
  } catch (error) {
    logger.error("Error detecting recurring pattern", { error });
    return null;
  }
}
