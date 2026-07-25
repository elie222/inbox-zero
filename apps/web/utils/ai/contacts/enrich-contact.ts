import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getEmailListPrompt, getUserInfoPrompt } from "@/utils/ai/helpers";

const schema = z.object({
  name: z
    .string()
    .nullable()
    .describe(
      "The person's full name as they sign their emails, or null if not evident.",
    ),
  title: z
    .string()
    .nullable()
    .describe(
      'Their job title exactly as stated in a signature or email context (e.g. "VP of Engineering"), or null if never stated.',
    ),
  company: z
    .string()
    .nullable()
    .describe(
      "The company or organization they work for, from signatures or context, or null if not evident.",
    ),
  phones: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            'The kind of line as indicated in the signature — "Mobile", "Work", "Fax", … Use "Other" when unlabeled.',
          ),
        value: z.string().describe("The phone number, formatted as written."),
      }),
    )
    .describe(
      "Phone numbers found in their email signatures. Empty array if none.",
    ),
  summary: z
    .string()
    .describe(
      "2-4 sentences: who this person is and the nature of their relationship with the user — how they know each other, what they typically email about, and anything notable about the relationship's current state.",
    ),
});
export type EnrichContactResult = z.infer<typeof schema>;

const MAX_SAMPLE_EMAILS = 10;

// Reads a contact's recent emails and extracts details they've shared
// (signature phone numbers, title, company) plus a relationship summary.
// Details must come from the emails — never guessed.
export async function aiEnrichContact({
  emailAccount,
  contactEmail,
  contactName,
  emails,
}: {
  emailAccount: EmailAccountWithAI;
  contactEmail: string;
  contactName?: string | null;
  emails: EmailForLLM[];
}): Promise<EnrichContactResult | null> {
  if (!emails.length) return null;

  const system = `You are an AI assistant that builds contact cards from email history.

<instructions>
You are given recent emails exchanged with ${contactName ? `${contactName} <${contactEmail}>` : contactEmail}.

Your task:
1. Extract contact details this person has shared about THEMSELVES — usually in email signatures: their full name, job title, company, and phone numbers.
2. Write a short relationship summary for the user's private notes: who this person is and how they and the user know each other, based on what they email about.

Rules:
- Only extract details that literally appear in the emails. Never invent or guess a phone number, title, or company.
- Details must belong to the contact, not to other people mentioned or quoted in the thread.
- If a detail appears in multiple versions, prefer the most recent one.
- Write the summary in the same language the emails predominantly use.
</instructions>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object with the following fields:
- "name": string or null — their full name as signed.
- "title": string or null — their job title.
- "company": string or null — their company.
- "phones": array of { "label": string, "value": string } — phone numbers from their signatures with the kind of line ("Mobile", "Work", "Fax", "Other"). Empty array if none.
- "summary": string — 2-4 sentence relationship summary.
</outputFormat>`;

  const prompt = `Analyze these emails exchanged with ${contactEmail}:

<sample_emails>
${getEmailListPrompt({
  messages: emails,
  messageMaxLength: 2000,
  maxMessages: MAX_SAMPLE_EMAILS,
})}
</sample_emails>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.EnrichContact,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Enrich contact",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
