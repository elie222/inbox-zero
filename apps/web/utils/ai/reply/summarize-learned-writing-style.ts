import { z } from "zod";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { withNetworkRetry } from "@/utils/llms/retry";
import type { getEmailAccountWithAi } from "@/utils/user/get";

const learnedWritingStyleSchema = z.object({
  learnedWritingStyle: z.string().trim().min(1).max(1500),
});

function getSystemPrompt() {
  return `You maintain a compact learned writing-style summary for an email user based on accumulated style memories from prior draft edits.

${PROMPT_SECURITY_INSTRUCTIONS}

Return a concise prompt-ready style guide that helps draft future emails.

Rules:
- Summarize repeated style patterns, not one-off instructions.
- Focus on directness, verbosity, greeting habits, sign-off habits, paragraph structure, formatting, and how much filler the user removes.
- Keep it under 1500 characters.
- Include two sections exactly:
  1. "Observed patterns:" with 2-5 bullets
  2. "Representative edits:" with 2-3 short bullets
- Representative edits should be short paraphrases of draft-to-send changes, not full email quotes.
- Do not mention names, email addresses, company names, phone numbers, dates, links, or other identifying details.
- This learned summary is advisory and should complement, not replace, explicit user-written style settings.`;
}

export async function aiSummarizeLearnedWritingStyle({
  styleMemoryEvidence,
  emailAccount,
}: {
  styleMemoryEvidence: string;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const prompt = `<style_memory_evidence>
${styleMemoryEvidence}
</style_memory_evidence>

${getUserInfoPrompt({ emailAccount })}

Summarize the user's learned writing style from this evidence.`;

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Learned writing style compaction",
    modelOptions,
  });

  const result = await withNetworkRetry(
    () =>
      generateObject({
        ...modelOptions,
        system: getSystemPrompt(),
        prompt,
        schema: learnedWritingStyleSchema,
      }),
    { label: "Learned writing style compaction" },
  );

  return result.object.learnedWritingStyle.trim();
}
