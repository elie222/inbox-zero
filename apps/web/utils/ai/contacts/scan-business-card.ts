import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";

const schema = z.object({
  name: z
    .string()
    .nullable()
    .describe("The person's full name as printed, or null if absent."),
  title: z
    .string()
    .nullable()
    .describe(
      'Their job title as printed (e.g. "VP of Sales"), or null if absent.',
    ),
  companyName: z
    .string()
    .nullable()
    .describe("The company or organization name, or null if absent."),
  email: z
    .string()
    .nullable()
    .describe("Their email address exactly as printed, or null if absent."),
  phones: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            'The kind of line as printed — "Mobile", "Work", "Office", "Fax", "Main". Use "Other" when unlabeled.',
          ),
        value: z.string().describe("The number, formatted as printed."),
      }),
    )
    .describe("Every phone number on the card. Empty array if none."),
  website: z
    .string()
    .nullable()
    .describe("Their website as printed, or null if absent."),
});
export type ScanBusinessCardResult = z.infer<typeof schema>;

// Reads a photo of a paper business card into contact fields. Everything is
// nullable because cards vary wildly — a card with only a name and mobile
// number is common, and the caller reviews the result before saving.
export async function aiScanBusinessCard({
  emailAccount,
  imageDataUrl,
}: {
  emailAccount: EmailAccountWithAI;
  imageDataUrl: string;
}): Promise<ScanBusinessCardResult> {
  const system = `You read photographs of paper business cards and return the contact details printed on them.

<instructions>
Transcribe only what is printed on the card. Never infer, complete, or correct a value:
- Do not guess an email address from the person's name and the company's domain.
- Do not expand an abbreviated company name.
- Do not reformat phone numbers; copy the digits and separators as printed.
- A card is often bilingual or double-sided. If the same detail appears twice, return it once.
- When a field is not printed on the card, return null (or an empty array for phones).
- The photo may be angled, cropped, or low contrast. If a value is genuinely unreadable, return null rather than a partial or invented guess.
</instructions>

<outputFormat>
Respond with a JSON object with these fields:
- "name": string or null
- "title": string or null
- "companyName": string or null
- "email": string or null
- "phones": array of { "label": string, "value": string }
- "website": string or null
</outputFormat>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.ScanBusinessCard,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Scan business card",
    modelOptions,
    // The image is whatever someone handed the user — treat its text as data
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe the contact details printed on this business card as JSON.",
          },
          { type: "image", image: imageDataUrl },
        ],
      },
    ],
    schema,
  });

  return result.object;
}
