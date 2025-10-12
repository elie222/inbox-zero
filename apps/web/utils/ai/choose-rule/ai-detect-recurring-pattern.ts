import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import {
  getEmailListPrompt,
  getUserInfoPrompt,
  getUserRulesPrompt,
} from "@/utils/ai/helpers";

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
  consistentRuleName,
}: {
  emails: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  rules: {
    name: string;
    instructions: string;
  }[];
  consistentRuleName?: string;
}): Promise<DetectPatternResult | null> {
  // Extract the sender email from the first email
  // All emails should be from the same sender
  const senderEmail = emails[0].from;

  if (!senderEmail) return null;

  const system = `You are an AI assistant that helps analyze if a sender's emails should consistently be matched to a specific rule.

<instructions>
Your task is to determine if emails from a specific sender should ALWAYS be matched to the same rule.

${consistentRuleName ? `IMPORTANT: Historical data shows that ALL previous emails from this sender have been matched to the "${consistentRuleName}" rule. Your task is to verify if this pattern should be learned for future emails.` : ""}

Analyze the email content to determine if this sender ALWAYS matches a specific rule.
Only return a matchedRule if you're 90%+ confident all future emails from this sender will serve the same purpose; otherwise return null.

A sender should only be matched to a rule if you are HIGHLY CONFIDENT that:
- All future emails from this sender will serve the same purpose
- The purpose clearly aligns with one specific rule
- There's a consistent pattern across all sample emails provided
${consistentRuleName ? `- The content justifies always matching to the "${consistentRuleName}" rule` : ""}

Examples of senders that typically match a single rule:
- invoice@stripe.com → receipt rule (always sends payment confirmations)
- newsletter@substack.com → newsletter rule (always sends newsletters)
- noreply@linkedin.com → notification rule (always sends platform notifications)
- calendar@calendly.com → calendar rule (always sends calendar invites)

Examples of senders that should NOT have learned patterns:
- personal emails (john@gmail.com) → content varies too much

Pay close attention to:
1. The sender's email domain - generic domains (gmail.com, outlook.com) rarely warrant pattern learning
2. The ACTUAL CONTENT of emails - must be consistently about the same topic/purpose
3. The sender's role - service-specific emails are good candidates, personal emails are not

Be conservative in your matching. If there's any doubt, return null for "matchedRule".
</instructions>

${getUserRulesPrompt({ rules })}

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object with the following fields:
- "matchedRule": string or null - the name of the existing rule that should handle all emails from this sender
- "explanation": string - one sentence explanation of why this rule does or doesn't match

If you're not confident (at least 90% certain) that a single rule should handle all emails from this sender, return null for "matchedRule".
</outputFormat>`;

  const prompt = `Analyze these emails and determine if they consistently match a rule:

<sender>${senderEmail}</sender>

<sample_emails>
${getEmailListPrompt({ messages: emails, messageMaxLength: 500 })}
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
