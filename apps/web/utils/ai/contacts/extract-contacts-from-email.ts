import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const schema = z.object({
  people: z
    .array(
      z.object({
        name: z
          .string()
          .nullable()
          .describe("The person's full name as written, or null if unnamed."),
        email: z
          .string()
          .describe("Their email address exactly as it appears."),
        title: z
          .string()
          .nullable()
          .describe("Their job title/role if stated, or null."),
        phones: z
          .array(
            z.object({
              label: z
                .string()
                .describe(
                  'The kind of line as indicated — "Mobile", "Work", "Fax", … Use "Other" when unlabeled.',
                ),
              value: z.string().describe("The number, formatted as written."),
            }),
          )
          .describe("Phone numbers listed for this person. Empty if none."),
        companyName: z
          .string()
          .nullable()
          .describe(
            "The company they belong to, if stated or clearly implied by the email. Null when unclear.",
          ),
      }),
    )
    .describe(
      "Every person whose contact details appear in the email body. Empty array when the email lists no people.",
    ),
});
export type ExtractedContacts = z.infer<typeof schema>;

// Finds people listed inside an email's body (rosters, signatures forwarded
// along, "here's who to contact" lists) so the user can add them as
// contacts. Only extracts what's literally written — never guesses.
export async function aiExtractContactsFromEmail({
  emailAccount,
  from,
  subject,
  content,
}: {
  emailAccount: EmailAccountWithAI;
  from: string;
  subject: string;
  content: string;
}): Promise<ExtractedContacts | null> {
  const system = `You are an AI assistant that extracts contact details from an email so the user can save them to their address book.

<instructions>
The email below contains one or more people's contact details in its BODY — e.g. a list of colleagues, a roster, an introduction, or forwarded signatures.

Extract every person whose contact details appear in the body:
- Pair each email address with the right name, title, phone number(s), and company based on how the text groups them.
- Only include what is literally written. Never invent or guess a detail.
- Skip generic/automated mailboxes (no-reply@, info@, support@) unless a specific person is attached to them.
- The message SENDER belongs in the list only when the body itself presents their details (e.g. they're part of the roster) — being the sender alone doesn't qualify.
</instructions>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object: "people" — array of { "name", "email", "title", "phones": [{ "label", "value" }], "companyName" }.
</outputFormat>`;

  const prompt = `<email>
From: ${from}
Subject: ${subject}

${content}
</email>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.ExtractContacts,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Extract contacts from email",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const response = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return response.object;
}
