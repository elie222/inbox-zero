import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { truncate } from "@/utils/string";
import { removeExcessiveWhitespace } from "@/utils/string";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("writing-style-analyzer");

export async function aiAnalyzeWritingStyle(options: {
  emails: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
}) {
  const { emails, emailAccount } = options;

  if (!emails.length) {
    logger.warn("No emails provided for writing style analysis");
    return null;
  }

  const system = `You are a writing style analyst specializing in email communication patterns.

Analyze the user's writing style based on their previously sent emails. Examine the collection of emails to identify patterns in their communication style and create a personalized style guide with the following elements:

- Typical Length: Determine the average length of their emails (e.g., number of sentences or paragraphs).

- Formality: Assess whether their writing style is formal, informal, or mixed, with specific examples of indicators.

- Common Greeting: Identify their standard opening greeting pattern, if any. Also note if the user often skips a greeting and gets straight to the point.
Example output:
"Hey," or none (sometimes just starts with content or a single word)."
Explicitly mention if the user often skips a greeting.

- Notable Traits: List distinctive writing characteristics such as punctuation habits, question usage, paragraph structure, or language preferences. Include traits such as:
  - Frequent use of contractions
  - Beginning sentences with conjunctions
  - Concise direct responses
  - Use of exclamation points
  - Minimal closings
  - Omitting subjects
  - Using abbreviations
  - Including personal context
  - Addressing multiple points with line breaks
  - Using parenthetical asides
  - Consider the use of emoticons.

- Examples: Include 2-3 representative examples of the user's actual writing style, including sentences or short paragraphs extracted from their emails that best showcase their typical writing patterns.

Provide this analysis in a structured format that serves as a personalized email style guide for the user. The result should be valid JSON.`;

  const prompt = `Here are the emails I've sent previously. Please analyze my writing style:
<emails>
${emails
  .map(
    (e) => `<email>
  <to>${e.to}</to>
  <body>${truncate(removeExcessiveWhitespace(e.content), 1000)}</body>
</email>`,
  )
  .join("\n")}
</emails>

${getUserInfoPrompt({ emailAccount })}`;

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Writing Style Analysis",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      typicalLength: z.string(),
      formality: z.string(),
      commonGreeting: z.string(),
      notableTraits: z.array(z.string()),
      examples: z.array(z.string()),
    }),
  });
  logger.trace("Output", result.object);

  return result.object;
}
