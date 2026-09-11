import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";

const MAX_TEXT_LENGTH = 30_000;

export async function aiTranslateEmails({
  texts,
  targetLanguage,
  emailAccount,
}: {
  texts: string[];
  targetLanguage: string;
  emailAccount: EmailAccountWithAI;
}): Promise<string[]> {
  if (texts.length === 0) return [];

  if (texts.every((text) => !text.trim())) {
    return texts.map(() => "");
  }

  // Hard-slice without ellipsis so truncation markers aren't treated as content.
  const truncatedTexts = texts.map((text) => text.slice(0, MAX_TEXT_LENGTH));

  const system = `You are a precise email translator.
Translate each provided text into the target language identified by the BCP 47 language tag.
Return only translations — no commentary, preface, or explanation.
Preserve each input's line-by-line structure exactly: keep every line break, blank line, list marker, link, and indentation in the same position, and translate only the human-language text within that structure.
Keep proper nouns, email addresses, URLs, and code-like tokens unchanged when translating would break them.
If a text is empty or only whitespace, return an empty string for that entry.
The translations array must have the same length and order as the input texts.`;

  const prompt = `Target language (BCP 47): ${targetLanguage}

Translate each text below into the target language.

${formatTextsForPrompt(truncatedTexts)}`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.TranslateEmail,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Translate email",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: translationSchema(texts.length),
  });

  return result.object.translations.map((translation, index) =>
    texts[index].trim() ? translation : "",
  );
}

function translationSchema(textCount: number) {
  return z.object({
    translations: z
      .array(z.string())
      // `.length()` compiles to JSON Schema minItems/maxItems, which OpenRouter
      // still forwards. superRefine keeps the check in Zod so generateObject
      // can retry via TypeValidationError / NoObjectGeneratedError.
      .superRefine((translations, ctx) => {
        if (translations.length !== textCount) {
          ctx.addIssue({
            code: "custom",
            message: `Expected ${textCount} translations, received ${translations.length}`,
          });
        }
      })
      .describe(
        "Translated texts in the same order and length as the input texts",
      ),
  });
}

function formatTextsForPrompt(texts: string[]) {
  return texts
    .map(
      (text, index) => `<text index="${index}">
${text}
</text>`,
    )
    .join("\n\n");
}
