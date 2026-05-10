import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { appendOllamaOnlySystemGuidance } from "@/utils/llms/ollama-guidance";
import type { getEmailAccountWithAi } from "@/utils/user/get";

const learnedWritingStyleSchema = z.object({
  learnedWritingStyle: z.string().trim().min(1).max(1500),
});

export async function aiSummarizeLearnedWritingStyle({
  preferenceMemoryEvidence,
  emailAccount,
}: {
  preferenceMemoryEvidence: string;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const prompt = `<preference_memory_evidence>
${preferenceMemoryEvidence}
</preference_memory_evidence>

Summarize the user's learned writing style from this preference evidence.`;

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Learned writing style compaction",
    modelOptions,
    promptHardening: { trust: "trusted" },
  });

  const result = await generateObject({
    ...modelOptions,
    system: appendOllamaOnlySystemGuidance(
      { system: getSystemPrompt() },
      modelOptions,
      OLLAMA_LEARNED_WRITING_STYLE_RESPONSE_GUIDANCE,
    ).system,
    prompt,
    schema: learnedWritingStyleSchema,
  });

  return result.object.learnedWritingStyle.trim();
}

function getSystemPrompt() {
  return `You maintain a compact learned writing-style summary for an email user based on accumulated preference memories from prior draft edits.

Return a concise prompt-ready style guide that helps draft future emails match the user's edits.

Rules:
- Summarize repeated style patterns, not one-off instructions.
- Make the guidance operational. Prefer concrete constraints such as sentence count, whether to use greetings/sign-offs, how many questions or next steps to include, how much explanation to add, and how warm or plain the tone should be.
- Focus on directness, verbosity, greeting habits, sign-off habits, paragraph structure, formatting, and how much filler the user removes.
- Keep it under 1500 characters.
- Include two sections exactly:
  1. "Actionable rules:" with 3-6 bullets
  2. "Before/after patterns:" with 2-3 short bullets
- Before/after patterns should be compact, sanitized examples that show how the user tends to compress drafts. Use short paraphrases, not full email quotes.
- Do not mention names, email addresses, company names, phone numbers, dates, links, or other identifying details.
- This learned summary is advisory and should complement, not replace, explicit user-written style settings.`;
}

const OLLAMA_LEARNED_WRITING_STYLE_RESPONSE_GUIDANCE = [
  'Return a JSON object with exactly one top-level "learnedWritingStyle" string.',
  'Put the complete style guide inside "learnedWritingStyle"; do not return markdown or bullets outside the JSON object.',
] as const;
